FROM mcr.microsoft.com/playwright:v1.47.0-jammy

WORKDIR /app
COPY . .

# Install only what this image actually runs: the root workspace (tsc, prisma — the root
# postinstall generates the Prisma client) plus core and renderer. Installing every
# workspace would pull Next.js/React in for `web`, which the renderer never loads, bloating
# the image and slowing first-time builds for no benefit.
RUN npm install --include-workspace-root --workspace=core --workspace=renderer
RUN npm run build -w core && npm run build -w renderer

ENTRYPOINT ["node", "renderer/dist/cli.js"]
