import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PrismaClient } from '../generated/prisma/index.js';

declare global {
  var __doppelPrisma: PrismaClient | undefined;
}

// Resolve the SQLite database path as an ABSOLUTE path derived from this file's own
// location, rather than letting PrismaClient resolve the schema's relative datasource URL
// ("file:../doppel-dev.db") at runtime. That relative resolution works fine under plain
// Node and under Vitest, but breaks once Next.js's webpack bundles this code for the `web`
// workspace: Prisma's generated client ships a synthetic package.json (schema-hash-derived
// name, not `@prisma/client`/`@doppel/core`) that `serverExternalPackages` can't match by
// name, so the module gets bundled anyway and the relative path no longer resolves to the
// same location on disk. Computing the path from import.meta.url instead makes resolution
// correct regardless of which process (Vitest, the MCP server, Next.js bundled or not)
// loads this module, and regardless of the caller's cwd.
//
// This file is core/src/db.ts, compiled to core/dist/db.js. From core/dist/db.js's own
// directory, going up two levels (core/dist -> core -> repo root) reaches the repo root,
// where doppel-dev.db already lives (the same location the schema's relative URL targets).
const DB_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'doppel-dev.db');

export function createPrismaClient(): PrismaClient {
  return new PrismaClient({ datasourceUrl: `file:${DB_PATH}` });
}

export const prisma: PrismaClient = globalThis.__doppelPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__doppelPrisma = prisma;
}
