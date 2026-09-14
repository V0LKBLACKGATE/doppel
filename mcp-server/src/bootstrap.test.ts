import { describe, it, expect, vi } from 'vitest';
import { runBootstrap } from './bootstrap.js';

describe('runBootstrap', () => {
  it('reports dockerReady=true and no warnings when the API key, docker, the image build, and migrate all succeed', async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
    const result = await runBootstrap({ exec, platform: 'linux', env: { ANTHROPIC_API_KEY: 'sk-ant-test' } });

    expect(result.dockerReady).toBe(true);
    expect(result.anthropicKeyPresent).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('docker --version'));
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('docker build'));
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('prisma migrate deploy'));
  });

  it('warns at boot when ANTHROPIC_API_KEY is missing, without throwing', async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
    const result = await runBootstrap({ exec, platform: 'linux', env: {} });

    expect(result.anthropicKeyPresent).toBe(false);
    expect(result.warnings.some((w) => w.includes('ANTHROPIC_API_KEY'))).toBe(true);
  });

  it('attempts an OS-specific install when docker is missing, and warns (without throwing) if that also fails', async () => {
    const exec = vi.fn().mockImplementation((cmd: string) => {
      if (cmd.includes('docker --version')) return Promise.reject(new Error('not found'));
      if (cmd.includes('winget install')) return Promise.reject(new Error('needs elevation'));
      return Promise.resolve({ stdout: '', stderr: '' });
    });

    const result = await runBootstrap({ exec, platform: 'win32', env: { ANTHROPIC_API_KEY: 'sk-ant-test' } });

    expect(result.dockerReady).toBe(false);
    expect(result.warnings.some((w) => w.includes('Docker'))).toBe(true);
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('winget install'));
  });
});
