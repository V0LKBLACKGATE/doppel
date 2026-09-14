import fs from 'node:fs';
import { ZipArchive } from 'archiver';

export async function exportSite(rewrittenDir: string, outZipPath: string): Promise<{ zipPath: string }> {
  // Validate that rewrittenDir exists and is a directory
  const stats = fs.statSync(rewrittenDir, { throwIfNoEntry: false });
  if (!stats || !stats.isDirectory()) {
    throw new Error(`rewrittenDir does not exist or is not a directory: ${rewrittenDir}`);
  }

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(outZipPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on('close', () => resolve());
    output.on('error', reject);
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(rewrittenDir, false);
    archive.finalize();
  });

  return { zipPath: outZipPath };
}
