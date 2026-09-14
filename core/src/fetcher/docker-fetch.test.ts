import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fetchSiteViaDocker, DockerUnavailableError } from './docker-fetch.js';

function fakeSpawn(exitCode: number, onSpawn?: (args: string[]) => void) {
  return vi.fn((_cmd: string, args: string[]) => {
    onSpawn?.(args);
    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    setTimeout(() => child.emit('close', exitCode), 0);
    return child;
  });
}

describe('fetchSiteViaDocker', () => {
  it('runs docker with a volume mount and parses the manifest written by the container', async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doppel-docker-'));
    let capturedArgs: string[] = [];
    const spawnFn = fakeSpawn(0, (args) => {
      capturedArgs = args;
      const mountArg = args.find((a) => a.includes(':/data'));
      const hostDir = mountArg?.split(':/data')[0] ?? '';
      fs.mkdirSync(path.join(hostDir, 'pages'), { recursive: true });
      fs.writeFileSync(path.join(hostDir, 'pages', 'page-0.html'), '<html>ok</html>');
      fs.writeFileSync(
        path.join(hostDir, 'manifest.json'),
        JSON.stringify({ pages: [{ url: 'https://example.com', htmlPath: 'pages/page-0.html', usedRenderer: 'static' }] }),
      );
    });

    const result = await fetchSiteViaDocker('https://example.com', 20, { spawnFn: spawnFn as any, workDir });

    expect(result.workDir).toBe(workDir);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].html).toBe('<html>ok</html>');
    expect(capturedArgs).toContain('doppel-renderer');
    expect(capturedArgs.join(' ')).toContain('--maxPages 20');

    // Resource limits on the untrusted-content container
    expect(capturedArgs).toContain('--memory=1g');
    expect(capturedArgs).toContain('--cpus=1');
    expect(capturedArgs).toContain('--pids-limit=256');
    expect(capturedArgs.join(' ')).toContain('--security-opt no-new-privileges');
  });

  it('kills the container and rejects with DockerUnavailableError when the run exceeds its timeout', async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doppel-docker-'));
    const kill = vi.fn();
    const spawnFn = vi.fn(() => {
      const child = new EventEmitter() as any;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = kill;
      return child; // never emits 'close' — a hung container
    });

    await expect(
      fetchSiteViaDocker('https://example.com', 20, { spawnFn: spawnFn as any, workDir, timeoutMs: 25 }),
    ).rejects.toThrow(/timed out/);
    expect(kill).toHaveBeenCalled();
  });

  it('throws DockerUnavailableError when docker exits non-zero', async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doppel-docker-'));
    const spawnFn = fakeSpawn(1);
    await expect(fetchSiteViaDocker('https://example.com', 20, { spawnFn: spawnFn as any, workDir })).rejects.toBeInstanceOf(
      DockerUnavailableError,
    );
  });

  it('throws DockerUnavailableError when docker exits 0 but manifest is missing', async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doppel-docker-'));
    const spawnFn = fakeSpawn(0, () => {
      // Simulate docker exiting successfully but not writing manifest.json
    });
    await expect(fetchSiteViaDocker('https://example.com', 20, { spawnFn: spawnFn as any, workDir })).rejects.toBeInstanceOf(
      DockerUnavailableError,
    );
  });

  it('throws DockerUnavailableError when docker exits 0 but manifest is malformed', async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doppel-docker-'));
    const spawnFn = fakeSpawn(0, (args) => {
      const mountArg = args.find((a) => a.includes(':/data'));
      const hostDir = mountArg?.split(':/data')[0] ?? '';
      fs.mkdirSync(path.join(hostDir, 'pages'), { recursive: true });
      // Write invalid JSON
      fs.writeFileSync(path.join(hostDir, 'manifest.json'), 'not valid json {]');
    });
    await expect(fetchSiteViaDocker('https://example.com', 20, { spawnFn: spawnFn as any, workDir })).rejects.toBeInstanceOf(
      DockerUnavailableError,
    );
  });

  it('throws DockerUnavailableError when docker exits 0 but referenced HTML file is missing', async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doppel-docker-'));
    const spawnFn = fakeSpawn(0, (args) => {
      const mountArg = args.find((a) => a.includes(':/data'));
      const hostDir = mountArg?.split(':/data')[0] ?? '';
      // Write manifest but don't create the HTML file it references
      fs.mkdirSync(path.join(hostDir, 'pages'), { recursive: true });
      fs.writeFileSync(
        path.join(hostDir, 'manifest.json'),
        JSON.stringify({ pages: [{ url: 'https://example.com', htmlPath: 'pages/missing.html', usedRenderer: 'static' }] }),
      );
    });
    await expect(fetchSiteViaDocker('https://example.com', 20, { spawnFn: spawnFn as any, workDir })).rejects.toBeInstanceOf(
      DockerUnavailableError,
    );
  });
});
