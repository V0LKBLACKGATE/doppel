# Doppel

**Clone qualquer site. Rebrande com IA. Revise e edite cada sugestão. Exporte um pacote real e funcional — tudo rodando na sua própria máquina.**

[![Built with Claude](https://img.shields.io/badge/Built%20with-Claude-6B4FBB)](https://claude.com)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org)
[![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178C6)](https://www.typescriptlang.org)
[![Prisma + SQLite](https://img.shields.io/badge/Prisma-SQLite-2D3748)](https://www.prisma.io)
[![Docker](https://img.shields.io/badge/Docker-renderer%20isolado-2496ED)](https://www.docker.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Desenvolvido por **VØLK // BLACKGATE** — [@V0LKBLACKGATE](https://github.com/V0LKBLACKGATE)

---

## O que faz

Cole uma URL. O Doppel rastreia o site (com fallback para browser headless de verdade em páginas com JS pesado), identifica logo/cores/nome, e pede pro Claude desenhar um rebrand completo — paleta nova, textos reescritos, logo novo em SVG — para a marca/nicho que você informar.

Aí você revisa a proposta do Claude na UI web local: a paleta (lista de hex), as trocas de texto (frase antiga → frase nova) e o SVG do logo voltam como **campos de texto editáveis**, então dá pra ajustar o que quiser antes de aplicar. Ao exportar, o Doppel reescreve o site, mostra o resultado num frame de preview e te entrega um `.zip` do clone rebrandado. (A comparação é antes/depois no tempo — as páginas rebrandadas aparecem depois da exportação; ainda não existe uma visão lado a lado com o original.)

Duas formas de usar:
- **Direto de uma conversa com o Claude** (Claude Code ou Claude Desktop), via o servidor MCP incluído — peça "clona esse site como a Marca X" e ele roda o fluxo inteiro.
- **Pela UI web local**, onde você edita o rebrand e vê o preview do resultado exportado.

Tudo roda em `localhost`. Não existe backend hospedado — o uso da API do Claude é seu, com seu próprio custo.

## Por que existe

Construído como demonstração de usar o Claude como *motor de decisão* de um produto, não um recurso colado por fora: o Claude olha dados reais de marca extraídos do site e toma decisões de design de verdade (paleta, copy, logo), revisadas e ajustadas por um humano antes de qualquer coisa ser exportada.

## Prints

Inicialização do servidor MCP — a assinatura VØLK // BLACKGATE, impressa antes de qualquer outra coisa rodar:

![Banner do servidor MCP](docs/screenshots/mcp-server-banner.png)

Dashboard — histórico de jobs e o formulário de novo clone:

![Dashboard](docs/screenshots/dashboard.png)

Revisão do job — sugestões de rebrand do Claude, editáveis antes de aplicar:

![Revisão do job](docs/screenshots/job-review.png)

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

Código completo do diagrama: [docs/architecture-diagram.md](docs/architecture-diagram.md)

## Uso responsável

O Doppel propositalmente **não tem nenhuma trava de uso** — sem confirmação, sem checagem de licença. É feito pra **estudo e prototipagem**: propostas de agência/freelancer ("olha como seu site ficaria"), e como vitrine técnica. Não é feito pra republicar o clone de um site de terceiro como produto final. Por favor não faça isso.

O Doppel também não clona (e não tem como clonar) comportamento que depende de backend: formulários, login e conteúdo vindo de CMS continuam no servidor do site original e não funcionam no clone.

## Como usar

**Via Claude (MCP):**
```bash
git clone https://github.com/V0LKBLACKGATE/doppel.git
cd doppel
npm install
npm run build
claude mcp add doppel -- node /caminho/absoluto/para/doppel/mcp-server/dist/index.js
```
> O Doppel ainda não está publicado no npm, então `npx doppel-mcp` não funciona — aponte o comando MCP para o seu build local. Publicar no npm está no plano, mas ainda não foi feito.

Depois, numa conversa: *"Clona https://exemplo.com como uma marca chamada Sorriso+, uma clínica odontológica."* O Claude imprime o banner, faz o bootstrap de Docker/Playwright/banco local no primeiro uso, e te devolve um link `localhost` pra revisar.

**Direto pela UI web:**
```bash
npm install
docker build -f renderer/Dockerfile -t doppel-renderer .
npx prisma migrate deploy --schema prisma/schema.prisma
npm run build
ANTHROPIC_API_KEY=sk-... npm run dev -w web
```
Certifique-se de que `ANTHROPIC_API_KEY` está definida no seu ambiente antes de começar — o passo de rebrand com Claude precisa dela para funcionar.

## Stack

Next.js 15 · TypeScript (strict) · Prisma + SQLite · Playwright · Docker · `@modelcontextprotocol/sdk` · `@anthropic-ai/sdk`

## Licença

MIT — veja [LICENSE](LICENSE).
