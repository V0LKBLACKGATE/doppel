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
    child.on('error', () => reject(new DockerUnavailableError('docker binary not found')));
    child.on('close', (code: number) => {
      if (code === 0) resolve();
      else reject(new DockerUnavailableError(`docker exited with code ${code}`));
    });
  });

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
}
