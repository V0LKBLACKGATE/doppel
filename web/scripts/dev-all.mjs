// Runs the Next.js dev server and the isolated-origin preview server (preview-server.mjs)
// together. A plain `next dev` alone leaves cloned-site iframes pointing at a dead port.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webPort = process.env.WEB_PORT ?? '3500';
const previewPort = process.env.PREVIEW_PORT ?? '3501';

// shell: true is required on Windows to spawn the npx.cmd shim at all (spawn() otherwise
// fails with EINVAL — CreateProcess can't execute a batch file directly). webPort/
// previewPort only ever come from this process's own env, never from untrusted input, so
// the "arguments aren't escaped" risk that flag normally warns about doesn't apply here.
const next = spawn('npx', ['next', 'dev', '-p', webPort], {
  cwd: webDir,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, PREVIEW_ORIGIN: `http://localhost:${previewPort}` },
});
const preview = spawn(process.execPath, ['preview-server.mjs'], {
  cwd: webDir,
  stdio: 'inherit',
  env: { ...process.env, PREVIEW_PORT: previewPort },
});

let shuttingDown = false;
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  next.kill();
  preview.kill();
  process.exit(code ?? 0);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
next.on('exit', (code) => shutdown(code));
preview.on('exit', (code) => shutdown(code));
