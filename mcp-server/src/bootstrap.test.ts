import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { runBootstrap, REPO_ROOT } from './bootstrap.js';

// Every test that isn't specifically about the web-app-startup behavior stubs checkUrl to
// report "already reachable" so it never falls into spawning/polling — keeping those tests
// focused on the concern they actually name.
const webAppAlreadyRunning = { checkUrl: vi.fn().mockResolvedValue(true) };

describe('runBootstrap', () => {
  it('reports dockerReady=true and no warnings when the API key, docker, the image build, and migrate all succeed', async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
    const result = await runBootstrap({ exec, platform: 'linux', env: { ANTHROPIC_API_KEY: 'sk-ant-test' }, ...webAppAlreadyRunning });

    expect(result.dockerReady).toBe(true);
    expect(result.anthropicKeyPresent).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('docker --version'));
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('docker build'), { cwd: expect.any(String) });
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('prisma migrate deploy'), { cwd: expect.any(String) });
  });

  it('runs the repo-relative commands from the repo root, not from the caller cwd', async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
    await runBootstrap({ exec, platform: 'linux', env: { ANTHROPIC_API_KEY: 'sk-ant-test' }, repoRoot: '/srv/doppel', ...webAppAlreadyRunning });

    expect(exec).toHaveBeenCalledWith(expect.stringContaining('docker build'), { cwd: '/srv/doppel' });
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('prisma migrate deploy'), { cwd: '/srv/doppel' });
  });

  it('derives REPO_ROOT from this module location, so it holds whatever the cwd is', () => {
    expect(path.isAbsolute(REPO_ROOT)).toBe(true);
    // The two files the bootstrap commands reference by repo-relative path must be there.
    expect(fs.existsSync(path.join(REPO_ROOT, 'renderer', 'Dockerfile'))).toBe(true);
    expect(fs.existsSync(path.join(REPO_ROOT, 'prisma', 'schema.prisma'))).toBe(true);
  });

  it('warns at boot when ANTHROPIC_API_KEY is missing, without throwing', async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
    const result = await runBootstrap({ exec, platform: 'linux', env: {}, ...webAppAlreadyRunning });

    expect(result.anthropicKeyPresent).toBe(false);
    expect(result.warnings.some((w) => w.includes('ANTHROPIC_API_KEY'))).toBe(true);
  });

  it('attempts an OS-specific install when docker is missing, and warns (without throwing) if that also fails', async () => {
    const exec = vi.fn().mockImplementation((cmd: string) => {
      if (cmd.includes('docker --version')) return Promise.reject(new Error('not found'));
      if (cmd.includes('winget install')) return Promise.reject(new Error('needs elevation'));
      return Promise.resolve({ stdout: '', stderr: '' });
    });

    const result = await runBootstrap({ exec, platform: 'win32', env: { ANTHROPIC_API_KEY: 'sk-ant-test' }, ...webAppAlreadyRunning });

    expect(result.dockerReady).toBe(false);
    expect(result.warnings.some((w) => w.includes('Docker'))).toBe(true);
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('winget install'));
  });

  it('times out and resolves (without hanging) when an exec call never returns', async () => {
    const exec = vi.fn().mockImplementation(() => new Promise(() => {})); // never resolves
    const result = await runBootstrap({ exec, platform: 'linux', env: { ANTHROPIC_API_KEY: 'sk-ant-test' }, timeoutMs: 50, ...webAppAlreadyRunning });

    expect(result.dockerReady).toBe(false);
    expect(result.anthropicKeyPresent).toBe(true);
    expect(result.warnings.some((w) => w.includes('Docker'))).toBe(true);
  });

  describe('web app startup', () => {
    const exec = () => vi.fn().mockResolvedValue({ stdout: '', stderr: '' });

    it('does not spawn the web app when it is already reachable', async () => {
      const checkUrl = vi.fn().mockResolvedValue(true);
      const spawnDetached = vi.fn();
      const result = await runBootstrap({ exec: exec(), platform: 'linux', env: { ANTHROPIC_API_KEY: 'sk-ant-test' }, checkUrl, spawnDetached });

      expect(result.webAppReady).toBe(true);
      expect(spawnDetached).not.toHaveBeenCalled();
    });

    it('spawns "npm run dev -w web" from the repo root when the web app is not reachable yet, then confirms it comes up', async () => {
      const checkUrl = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
      const spawnDetached = vi.fn();
      const result = await runBootstrap({
        exec: exec(),
        platform: 'linux',
        env: { ANTHROPIC_API_KEY: 'sk-ant-test' },
        repoRoot: '/srv/doppel',
        checkUrl,
        spawnDetached,
      });

      expect(spawnDetached).toHaveBeenCalledWith(
        'npm',
        ['run', 'dev', '-w', 'web'],
        expect.objectContaining({ cwd: '/srv/doppel', env: expect.objectContaining({ WEB_PORT: '3000', PREVIEW_PORT: '3001' }) }),
      );
      expect(result.webAppReady).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('derives WEB_PORT/PREVIEW_PORT for the spawned server from a custom DOPPEL_WEB_URL', async () => {
      const checkUrl = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
      const spawnDetached = vi.fn();
      await runBootstrap({
        exec: exec(),
        platform: 'linux',
        env: { ANTHROPIC_API_KEY: 'sk-ant-test', DOPPEL_WEB_URL: 'http://localhost:4500' },
        checkUrl,
        spawnDetached,
      });

      expect(spawnDetached).toHaveBeenCalledWith(
        'npm',
        ['run', 'dev', '-w', 'web'],
        expect.objectContaining({ env: expect.objectContaining({ WEB_PORT: '4500', PREVIEW_PORT: '4501' }) }),
      );
    });

    it('warns (without throwing) if the web app never becomes reachable in time', async () => {
      const checkUrl = vi.fn().mockResolvedValue(false);
      const spawnDetached = vi.fn();
      const result = await runBootstrap({
        exec: exec(),
        platform: 'linux',
        env: { ANTHROPIC_API_KEY: 'sk-ant-test' },
        timeoutMs: 50,
        checkUrl,
        spawnDetached,
      });

      expect(spawnDetached).toHaveBeenCalled();
      expect(result.webAppReady).toBe(false);
      expect(result.warnings.some((w) => w.includes('npm run dev -w web'))).toBe(true);
    });
  });
});
