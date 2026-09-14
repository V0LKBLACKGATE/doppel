/** @type {import('next').NextConfig} */
export default {
  // @doppel/core is a server-only package (Playwright, archiver, the generated Prisma
  // client, ...) — keep it (and @prisma/client) out of the webpack bundle for Route
  // Handlers/Server Components so they run via native require() like in core/mcp-server,
  // instead of being re-bundled by webpack. Note: this does NOT fully resolve a separate,
  // pre-existing issue with the generated Prisma client's relative SQLite datasource URL
  // under Next's bundler — see task-15-report.md ("Runtime concern") for details.
  serverExternalPackages: ['@prisma/client', '@doppel/core'],
};
