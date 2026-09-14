#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { printBanner } from './banner.js';
import { runBootstrap } from './bootstrap.js';
import { handleCloneSite, handleListClones, handleGetClonePreview, handleExportClone } from './tools.js';

const TOOLS = [
  {
    name: 'clone_site',
    description: 'Clona um site (URL) e gera sugestões de rebrand (paleta, textos, logo) para uma nova marca/nicho.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' }, brand_name: { type: 'string' }, niche: { type: 'string' } },
      required: ['url', 'brand_name'],
    },
  },
  { name: 'list_clones', description: 'Lista o histórico de clonagens já feitas.', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'get_clone_preview',
    description: 'Retorna o link de preview local de uma clonagem existente.',
    inputSchema: { type: 'object', properties: { job_id: { type: 'string' } }, required: ['job_id'] },
  },
  {
    name: 'export_clone',
    description: 'Aplica o rebrand e exporta o pacote .zip de uma clonagem já revisada.',
    inputSchema: { type: 'object', properties: { job_id: { type: 'string' } }, required: ['job_id'] },
  },
];

const HANDLERS: Record<string, (input: any) => Promise<unknown>> = {
  clone_site: handleCloneSite,
  list_clones: handleListClones,
  get_clone_preview: handleGetClonePreview,
  export_clone: handleExportClone,
};

async function main() {
  printBanner();
  const bootstrap = await runBootstrap();
  for (const warning of bootstrap.warnings) console.error(`[doppel] aviso: ${warning}`);

  const server = new Server({ name: 'doppel-mcp', version: '0.1.0' }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const handler = HANDLERS[request.params.name];
    if (!handler) throw new Error(`Unknown tool: ${request.params.name}`);
    const result = await handler(request.params.arguments ?? {});
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  });

  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
