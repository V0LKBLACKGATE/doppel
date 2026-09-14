import { exec as nodeExec } from 'node:child_process';
import { promisify } from 'node:util';

const defaultExec = promisify(nodeExec);

export interface BootstrapResult {
  dockerReady: boolean;
  anthropicKeyPresent: boolean;
  warnings: string[];
}

export interface BootstrapDeps {
  exec?: (cmd: string) => Promise<{ stdout: string; stderr: string }>;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}

const INSTALL_COMMANDS: Record<string, string> = {
  win32: 'winget install -e --id Docker.DockerDesktop',
  darwin: 'brew install --cask docker',
  linux: 'sudo apt-get update && sudo apt-get install -y docker.io',
};

export async function runBootstrap(deps: BootstrapDeps = {}): Promise<BootstrapResult> {
  const exec = deps.exec ?? ((cmd: string) => defaultExec(cmd));
  const platform = deps.platform ?? process.platform;
  const env = deps.env ?? process.env;
  const warnings: string[] = [];

  const anthropicKeyPresent = Boolean(env.ANTHROPIC_API_KEY);
  if (!anthropicKeyPresent) {
    warnings.push('ANTHROPIC_API_KEY não encontrada. Defina essa variável de ambiente antes de clonar um site — sem ela, o passo de rebrand com o Claude vai falhar.');
  }

  let dockerReady = await tryExec(exec, 'docker --version');

  if (!dockerReady) {
    const installCmd = INSTALL_COMMANDS[platform];
    if (installCmd) {
      const installed = await tryExec(exec, installCmd);
      dockerReady = installed && (await tryExec(exec, 'docker --version'));
    }
    if (!dockerReady) {
      warnings.push(
        'Docker não pôde ser instalado automaticamente. Instale manualmente (https://docs.docker.com/get-docker/) e rode de novo.',
      );
    }
  }

  if (dockerReady) {
    const built = await tryExec(exec, 'docker build -f renderer/Dockerfile -t doppel-renderer .');
    if (!built) warnings.push('Falha ao construir a imagem doppel-renderer — clonagem de sites ficará indisponível até isso ser corrigido.');
  }

  const migrated = await tryExec(exec, 'npx prisma migrate deploy --schema prisma/schema.prisma');
  if (!migrated) warnings.push('Falha ao rodar as migrations do banco local.');

  return { dockerReady, anthropicKeyPresent, warnings };
}

async function tryExec(exec: BootstrapDeps['exec'] & {}, cmd: string): Promise<boolean> {
  try {
    await exec!(cmd);
    return true;
  } catch {
    return false;
  }
}
