import { exec as nodeExec, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';

const promisifiedExec = promisify(nodeExec);

// Same default the MCP tools (tools.ts) use for the link they hand back, so a fresh install
// spawns the web app on the exact port that link points at.
const DEFAULT_WEB_BASE_URL = 'http://localhost:3000';
const WEB_APP_POLL_INTERVAL_MS = 500;

function defaultSpawnDetached(cmd: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }): void {
  // detached + unref + stdio 'ignore': the web app (and its preview-server.mjs sibling,
  // started together by `npm run dev -w web`) must keep running as a background service
  // after this bootstrap call returns, independent of whatever tool call started it.
  const child = spawn(cmd, args, {
    cwd: options.cwd,
    env: options.env,
    detached: true,
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  child.unref();
}

async function defaultCheckUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    // Any real HTTP response — even a 404 — means a server is actually listening and
    // answering there; only a network-level failure (nothing listening yet) should retry.
    return res.status < 500;
  } catch {
    return false;
  }
}

// node's exec overloads widen stdout/stderr to string | Buffer once an options object is
// passed; the bootstrap only ever cares whether the command succeeded, so normalize to
// strings here and keep the dependency's signature simple for tests.
async function defaultExec(cmd: string, options?: ExecOptions): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await promisifiedExec(cmd, options);
  return { stdout: String(stdout), stderr: String(stderr) };
}

// The repo-relative commands below (the Dockerfile path, the Prisma schema path) must NOT
// depend on the caller's working directory: when this server is launched as an MCP server
// (`claude mcp add doppel -- node .../mcp-server/dist/index.js`, or eventually `npx`), the
// cwd is whatever directory the client happened to be in. core/src/db.ts already solved
// exactly this for the SQLite path; the same technique applies here.
//
// This file is mcp-server/src/bootstrap.ts, compiled to mcp-server/dist/bootstrap.js. From
// that file's own directory, two levels up (mcp-server/dist -> mcp-server -> repo root)
// reaches the repo root, where renderer/Dockerfile and prisma/schema.prisma live.
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface BootstrapResult {
  dockerReady: boolean;
  anthropicKeyPresent: boolean;
  webAppReady: boolean;
  warnings: string[];
}

export interface ExecOptions {
  cwd?: string;
}

export interface BootstrapDeps {
  exec?: (cmd: string, options?: ExecOptions) => Promise<{ stdout: string; stderr: string }>;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  repoRoot?: string;
  spawnDetached?: (cmd: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => void;
  checkUrl?: (url: string) => Promise<boolean>;
}

const INSTALL_COMMANDS: Record<string, string> = {
  win32: 'winget install -e --id Docker.DockerDesktop',
  darwin: 'brew install --cask docker',
  linux: 'sudo apt-get update && sudo apt-get install -y docker.io',
};

export async function runBootstrap(deps: BootstrapDeps = {}): Promise<BootstrapResult> {
  const exec = deps.exec ?? ((cmd: string, options?: ExecOptions) => defaultExec(cmd, options));
  const platform = deps.platform ?? process.platform;
  const env = deps.env ?? process.env;
  const timeoutMs = deps.timeoutMs ?? 120000;
  const repoRoot = deps.repoRoot ?? REPO_ROOT;
  const warnings: string[] = [];

  const anthropicKeyPresent = Boolean(env.ANTHROPIC_API_KEY);
  if (!anthropicKeyPresent) {
    warnings.push('ANTHROPIC_API_KEY não encontrada. Defina essa variável de ambiente antes de clonar um site — sem ela, o passo de rebrand com o Claude vai falhar.');
  }

  let dockerReady = await tryExec(exec, 'docker --version', timeoutMs);

  if (!dockerReady) {
    const installCmd = INSTALL_COMMANDS[platform];
    if (installCmd) {
      const installed = await tryExec(exec, installCmd, timeoutMs);
      dockerReady = installed && (await tryExec(exec, 'docker --version', timeoutMs));
    }
    if (!dockerReady) {
      warnings.push(
        'Docker não pôde ser instalado automaticamente. Instale manualmente (https://docs.docker.com/get-docker/) e rode de novo.',
      );
    }
  }

  if (dockerReady) {
    // Both of these reference files by repo-relative path, so they have to run FROM the
    // repo root rather than from whatever directory the MCP client launched us in.
    const built = await tryExec(exec, 'docker build -f renderer/Dockerfile -t doppel-renderer .', timeoutMs, { cwd: repoRoot });
    if (!built) warnings.push('Falha ao construir a imagem doppel-renderer — clonagem de sites ficará indisponível até isso ser corrigido.');
  }

  const migrated = await tryExec(exec, 'npx prisma migrate deploy --schema prisma/schema.prisma', timeoutMs, { cwd: repoRoot });
  if (!migrated) warnings.push('Falha ao rodar as migrations do banco local.');

  // The MCP tools (tools.ts) hand back a `${WEB_BASE_URL}/jobs/<id>` link as soon as a clone
  // finishes, so that link has to actually resolve to something — the web app (and its
  // preview-server.mjs sibling, started together by `npm run dev -w web`) needs to already be
  // running, or get started here. Without this, "install via Claude" would still require a
  // manual `npm run dev -w web` from a terminal, which defeats the point of a chat-driven
  // install.
  const checkUrl = deps.checkUrl ?? defaultCheckUrl;
  const spawnDetached = deps.spawnDetached ?? defaultSpawnDetached;
  const webBaseUrl = env.DOPPEL_WEB_URL ?? DEFAULT_WEB_BASE_URL;

  let webAppReady = await checkUrl(webBaseUrl);
  if (!webAppReady) {
    const webPort = new URL(webBaseUrl).port || '3000';
    const previewPort = String(Number(webPort) + 1);
    spawnDetached('npm', ['run', 'dev', '-w', 'web'], {
      cwd: repoRoot,
      env: { ...env, WEB_PORT: webPort, PREVIEW_PORT: previewPort },
    });
    webAppReady = await waitForReady(checkUrl, webBaseUrl, timeoutMs);
    if (!webAppReady) {
      warnings.push(
        `Não consegui confirmar que a UI web subiu em ${webBaseUrl} a tempo. Se o link não abrir, rode "npm run dev -w web" manualmente.`,
      );
    }
  }

  return { dockerReady, anthropicKeyPresent, webAppReady, warnings };
}

async function waitForReady(
  checkUrl: NonNullable<BootstrapDeps['checkUrl']>,
  url: string,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await checkUrl(url)) return true;
    await new Promise((resolve) => setTimeout(resolve, Math.min(WEB_APP_POLL_INTERVAL_MS, Math.max(deadline - Date.now(), 0))));
  }
  return checkUrl(url);
}

async function tryExec(
  exec: BootstrapDeps['exec'] & {},
  cmd: string,
  timeoutMs: number = 120000,
  options?: ExecOptions,
): Promise<boolean> {
  try {
    await Promise.race([
      // Only pass an options object when there is one, so cwd-agnostic probes keep the
      // plain single-argument call shape.
      options ? exec!(cmd, options) : exec!(cmd),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeoutMs)
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}
