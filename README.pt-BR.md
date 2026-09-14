# Doppel

**Clone qualquer site. Rebrande com IA. Revise lado a lado. Exporte um pacote real e funcional — tudo rodando na sua própria máquina.**

[![Built with Claude](https://img.shields.io/badge/Built%20with-Claude-6B4FBB)](https://claude.com)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org)
[![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178C6)](https://www.typescriptlang.org)
[![Prisma + SQLite](https://img.shields.io/badge/Prisma-SQLite-2D3748)](https://www.prisma.io)
[![Docker](https://img.shields.io/badge/Docker-renderer%20isolado-2496ED)](https://www.docker.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Desenvolvido por **VØLK // BLACKGATE** — [@VOLKBLACKGATE](https://github.com/VOLKBLACKGATE)

---

## O que faz

Cole uma URL. O Doppel rastreia o site (com fallback para browser headless de verdade em páginas com JS pesado), identifica logo/cores/nome, e pede pro Claude desenhar um rebrand completo — paleta nova, textos reescritos, logo novo em SVG — para a marca/nicho que você informar. Você revisa as sugestões lado a lado com o original, ajusta o que quiser, e exporta um clone real, navegável e para download.

Duas formas de usar:
- **Direto de uma conversa com o Claude** (Claude Code ou Claude Desktop), via o servidor MCP incluído — peça "clona esse site como a Marca X" e ele roda o fluxo inteiro.
- **Pela UI web local**, onde a revisão visual de fato acontece.

Tudo roda em `localhost`. Não existe backend hospedado — o uso da API do Claude é seu, com seu próprio custo.

## Por que existe

Construído como demonstração de usar o Claude como *motor de decisão* de um produto, não um recurso colado por fora: o Claude olha dados reais de marca extraídos do site e toma decisões de design de verdade (paleta, copy, logo), revisadas e ajustadas por um humano antes de qualquer coisa ser exportada.

## Arquitetura

```mermaid
flowchart TB
    subgraph Entrada
        A[Chat com o Claude<br/>MCP server] --> C
        B[UI Web<br/>Next.js] --> C
    end
    C[core/pipeline] --> D[fetcher<br/>Docker isolado]
    D --> E[brand-analyzer]
    E --> F[claude-rebrander<br/>paleta + copy + logo SVG]
    F --> G{Revisão humana<br/>na UI Web}
    G -->|editar| F
    G -->|aprovar| H[site-rewriter]
    H --> I[exporter<br/>.zip + preview local]
```

## Uso responsável

O Doppel propositalmente **não tem nenhuma trava de uso** — sem confirmação, sem checagem de licença. É feito pra **estudo e prototipagem**: propostas de agência/freelancer ("olha como seu site ficaria"), e como vitrine técnica. Não é feito pra republicar o clone de um site de terceiro como produto final. Por favor não faça isso.

O Doppel também não clona (e não tem como clonar) comportamento que depende de backend: formulários, login e conteúdo vindo de CMS continuam no servidor do site original e não funcionam no clone.

## Como usar

**Via Claude (MCP):**
```bash
claude mcp add doppel -- npx doppel-mcp
```
Depois, numa conversa: *"Clona https://exemplo.com como uma marca chamada Sorriso+, uma clínica odontológica."* O Claude imprime o banner, faz o bootstrap de Docker/Playwright/banco local no primeiro uso, e te devolve um link `localhost` pra revisar.

**Direto pela UI web:**
```bash
npm install
npm run build
npm run dev -w web
```

## Stack

Next.js 15 · TypeScript (strict) · Prisma + SQLite · Playwright · Docker · `@modelcontextprotocol/sdk` · `@anthropic-ai/sdk`

## Licença

MIT — veja [LICENSE](LICENSE).
