FROM mcr.microsoft.com/playwright:v1.47.0-jammy

WORKDIR /app
COPY . .
RUN npm install
RUN npm run build -w core && npm run build -w renderer

ENTRYPOINT ["node", "renderer/dist/cli.js"]
