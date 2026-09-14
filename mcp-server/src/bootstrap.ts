import { exec as nodeExec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';

const promisifiedExec = promisify(nodeExec);

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

  return { dockerReady, anthropicKeyPresent, warnings };
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
