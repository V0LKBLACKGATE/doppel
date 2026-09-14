import Anthropic from '@anthropic-ai/sdk';
import * as cheerio from 'cheerio';
import type { BrandProfile } from '../brand-analyzer/index.js';

export interface RebrandResult {
  colorPalette: string[];
  copyChanges: Record<string, string>;
  logoSvg: string;
}

export class RebrandParseError extends Error {}

const COPY_SELECTOR = 'h1, h2, h3, button, a.cta, a[class*="cta" i]';

export function extractCopyExcerpts(pages: { html: string }[], max = 20): string[] {
  const seen = new Set<string>();
  for (const page of pages) {
    const $ = cheerio.load(page.html);
    $(COPY_SELECTOR).each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text) seen.add(text);
    });
  }
  return [...seen].slice(0, max);
}

const REBRAND_TOOL = {
  name: 'submit_rebrand',
  description: 'Submit the rebrand decisions for a cloned site.',
  input_schema: {
    type: 'object' as const,
    properties: {
      colorPalette: { type: 'array', items: { type: 'string' } },
      copyChanges: { type: 'object', additionalProperties: { type: 'string' } },
      logoSvg: { type: 'string' },
    },
    required: ['colorPalette', 'copyChanges', 'logoSvg'],
  },
};

export async function rebrandSite(
  profile: BrandProfile,
  copyExcerpts: string[],
  brandName: string,
  niche: string | undefined,
  opts: { client?: Anthropic } = {},
): Promise<RebrandResult> {
  const client = opts.client ?? new Anthropic();

  const prompt = [
    `Nova marca: ${brandName}`,
    niche ? `Nicho: ${niche}` : null,
    `Paleta atual (hex, mais frequente primeiro): ${JSON.stringify(profile.dominantColors)}`,
    `Nome atual detectado: ${profile.brandName ?? 'desconhecido'}`,
    `Textos de marca/copy encontrados no site: ${JSON.stringify(copyExcerpts)}`,
    '',
    'Gere: (1) uma paleta de cores nova com o MESMO número de cores, na MESMA ordem (cada posição substitui a cor correspondente da paleta atual);',
    '(2) copyChanges mapeando CADA texto da lista de copy acima (chave, EXATAMENTE como aparece) para uma versão reescrita fazendo sentido para a nova marca/nicho;',
    '(3) um logo simples em SVG (viewBox 0 0 200 60, sem <script>, cores coerentes com a nova paleta) usando as iniciais ou o nome curto da marca.',
  ]
    .filter(Boolean)
    .join('\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 2048,
    tools: [REBRAND_TOOL],
    tool_choice: { type: 'tool', name: 'submit_rebrand' },
    messages: [{ role: 'user', content: prompt }],
  });

  const toolUse = response.content.find(
    (block: { type: string }): block is { type: 'tool_use'; input: unknown } => block.type === 'tool_use',
  );
  if (!toolUse) throw new RebrandParseError('Claude did not return a submit_rebrand tool call');

  // Validate the shape of the response
  const input = toolUse.input as Record<string, unknown>;

  // Validate colorPalette
  if (!Array.isArray(input.colorPalette)) {
    throw new RebrandParseError('Claude returned colorPalette that is not an array');
  }
  if (input.colorPalette.length !== profile.dominantColors.length) {
    throw new RebrandParseError(
      `Claude returned ${input.colorPalette.length} colors, expected ${profile.dominantColors.length}`,
    );
  }
  if (!input.colorPalette.every((color) => typeof color === 'string')) {
    throw new RebrandParseError('Claude returned colorPalette with non-string values');
  }

  // Validate copyChanges
  if (typeof input.copyChanges !== 'object' || input.copyChanges === null || Array.isArray(input.copyChanges)) {
    throw new RebrandParseError('Claude returned copyChanges that is not a plain object');
  }
  if (!Object.entries(input.copyChanges).every(([k, v]) => typeof k === 'string' && typeof v === 'string')) {
    throw new RebrandParseError('Claude returned copyChanges with non-string keys or values');
  }

  // Validate logoSvg
  if (typeof input.logoSvg !== 'string' || input.logoSvg.trim().length === 0) {
    throw new RebrandParseError('Claude returned logoSvg that is not a non-empty string');
  }

  return {
    colorPalette: input.colorPalette,
    copyChanges: input.copyChanges as Record<string, string>,
    logoSvg: input.logoSvg,
  };
}
