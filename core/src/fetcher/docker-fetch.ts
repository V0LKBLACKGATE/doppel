import { spawn as nodeSpawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export class DockerUnavailableError extends Error {}

export interface DockerFetchResult {
  workDir: string;
  pages: { url: string; html: string; usedRenderer: 'static' | 'headless' }[];
}

/** Wall-clock ceiling for one crawl+render container. A full 20-page job with headless
 *  fallbacks finishes well inside this; anything slower is a hung container, and without a
 *  ceiling it would leave the job pinned at status='fetching' forever. */
export const DOCKER_RUN_TIMEOUT_MS = 5 * 60 * 1000;

export async function fetchSiteViaDocker(
  url: string,
  maxPages: number,
  opts: { spawnFn?: typeof nodeSpawn; workDir?: string; timeoutMs?: number } = {},
): Promise<DockerFetchResult> {
  const spawnFn = opts.spawnFn ?? nodeSpawn;
  const workDir = opts.workDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'doppel-job-'));
  const timeoutMs = opts.timeoutMs ?? DOCKER_RUN_TIMEOUT_MS;

  await new Promise<void>((resolve, reject) => {
    const child = spawnFn('docker', [
      'run',
      '--rm',
      // Resource limits: the container runs a browser against an arbitrary third-party site,
      // so cap what a hostile or simply heavy page can consume on the host, and stop the
      // process tree from gaining privileges. (No --user or network restriction: both break
      // the Playwright image's rendering.)
      //
      // Sized for a real crawl, not the single-page smoke test: the cgroup pids controller
      // counts THREADS, and one Chromium instance carries 40-60+ of them on its own before
      // the renderer/GPU/zygote processes add theirs — a 20-page crawl can approach a 256
      // ceiling and start failing fork(). 2g likewise leaves headroom against an OOM-kill
      // (exit 137) on a heavy site. Still a real bound on a runaway page, just not one a
      // legitimate job trips.
      '--memory=2g',
      '--cpus=1',
      '--pids-limit=1024',
      '--security-opt',
      'no-new-privileges',
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
    let settled = false;

    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      finish();
    };

    // Never hang: same contract as the spawn-error and non-zero-exit paths below.
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      (child as unknown as { kill?: (signal?: NodeJS.Signals) => boolean }).kill?.('SIGKILL');
      reject(new DockerUnavailableError(`docker run timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    timer.unref?.();

    child.on('error', (err: NodeJS.ErrnoException) => {
      settle(() => {
        if (err.code === 'ENOENT') {
          reject(new DockerUnavailableError('docker binary not found'));
        } else {
          reject(new DockerUnavailableError(`docker spawn failed: ${err.message}`));
        }
      });
    });

    child.stdout?.on('data', () => {
      // Drain stdout to prevent pipe buffer from filling
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderrText += data.toString();
    });

    child.on('close', (code: number) => {
      settle(() => {
        if (code === 0) resolve();
        else {
          const msg = stderrText ? `docker exited with code ${code}: ${stderrText}` : `docker exited with code ${code}`;
          reject(new DockerUnavailableError(msg));
        }
      });
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
