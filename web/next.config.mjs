/** @type {import('next').NextConfig} */
export default {
  // @doppel/core is a server-only package (Playwright, archiver, the generated Prisma
  // client, ...) — keep it (and @prisma/client) out of the webpack bundle for Route
  // Handlers/Server Components so they run via native require() like in core/mcp-server,
  // instead of being re-bundled by webpack.
  serverExternalPackages: ['@prisma/client', '@doppel/core'],
};
