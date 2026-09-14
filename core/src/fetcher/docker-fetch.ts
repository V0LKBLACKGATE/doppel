import { spawn as nodeSpawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export class DockerUnavailableError extends Error {}

export interface DockerFetchResult {
  workDir: string;
  pages: { url: string; html: string; usedRenderer: 'static' | 'headless' }[];
}

export async function fetchSiteViaDocker(
  url: string,
  maxPages: number,
  opts: { spawnFn?: typeof nodeSpawn; workDir?: string } = {},
): Promise<DockerFetchResult> {
  const spawnFn = opts.spawnFn ?? nodeSpawn;
  const workDir = opts.workDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'doppel-job-'));

  await new Promise<void>((resolve, reject) => {
    const child = spawnFn('docker', [
      'run',
      '--rm',
      '-v',
      `${workDir}:/data`,
      'doppel-renderer',
      '--url',
      url,
      '--maxPages',
      String(maxPages),
      '--out',
      '/data',
    ]);

    let stderrText = '';

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        reject(new DockerUnavailableError('docker binary not found'));
      } else {
        reject(new DockerUnavailableError(`docker spawn failed: ${err.message}`));
      }
    });

    child.stdout?.on('data', () => {
      // Drain stdout to prevent pipe buffer from filling
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderrText += data.toString();
    });

    child.on('close', (code: number) => {
      if (code === 0) resolve();
      else {
        const msg = stderrText ? `docker exited with code ${code}: ${stderrText}` : `docker exited with code ${code}`;
        reject(new DockerUnavailableError(msg));
      }
    });
  });

  try {
    const manifestPath = path.join(workDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
      pages: { url: string; htmlPath: string; usedRenderer: 'static' | 'headless' }[];
    };

    return {
      workDir,
      pages: manifest.pages.map((p) => ({
        url: p.url,
        usedRenderer: p.usedRenderer,
        html: fs.readFileSync(path.join(workDir, p.htmlPath), 'utf-8'),
      })),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new DockerUnavailableError(`failed to parse container output: ${message}`);
  }
}
