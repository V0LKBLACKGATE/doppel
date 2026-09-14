import fs from 'node:fs';
import { ZipArchive } from 'archiver';

export async function exportSite(rewrittenDir: string, outZipPath: string): Promise<{ zipPath: string }> {
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(outZipPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on('close', () => resolve());
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(rewrittenDir, false);
    archive.finalize();
  });

  return { zipPath: outZipPath };
}
