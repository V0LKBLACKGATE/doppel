# Doppel

**Clone any site. Rebrand it with AI. Review and edit every suggestion. Export a real, working package — all running on your own machine.**

[![Built with Claude](https://img.shields.io/badge/Built%20with-Claude-6B4FBB)](https://claude.com)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org)
[![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178C6)](https://www.typescriptlang.org)
[![Prisma + SQLite](https://img.shields.io/badge/Prisma-SQLite-2D3748)](https://www.prisma.io)
[![Docker](https://img.shields.io/badge/Docker-isolated%20renderer-2496ED)](https://www.docker.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Developed by **VØLK // BLACKGATE** — [@V0LKBLACKGATE](https://github.com/V0LKBLACKGATE)

---

## What it does

Paste a URL. Doppel crawls the site (falling back to a real headless browser for JS-heavy pages), figures out its logo/colors/name, and asks Claude to design a full rebrand — new palette, rewritten copy, a new SVG logo — for whatever brand/niche you tell it. The crawled site itself renders in a navigable preview right away, so you can confirm the clone actually worked before deciding anything about the rebrand.

You then review Claude's proposal in the local web UI: the palette (hex list), the copy changes (old phrase → new phrase) and the SVG logo all come back as **editable text fields**, so you can tweak anything you don't like before applying it. Hit export and Doppel rewrites the site and shows it side by side with the original — two independently navigable preview frames — plus a downloadable `.zip` of the rebranded clone.

Two ways to drive it:
- **From a chat with Claude** (Claude Code or Claude Desktop) via the bundled MCP server — say "clone this site as Brand X" and it runs end to end.
- **From the local web UI**, where you edit the rebrand and see it side by side with the original.

Everything runs on `localhost`. There is no hosted backend — you use your own Claude API usage, at your own cost.

## Why this exists

Built as a demonstration of using Claude as the *decision engine* of a product, not a bolt-on feature: Claude looks at real scraped brand data and makes actual design calls (palette, copy, logo), reviewed and refined by a human before anything ships.

## Screenshots

MCP server startup — the VØLK // BLACKGATE signature, printed before anything else runs:

![MCP server banner](docs/screenshots/mcp-server-banner.png)

Dashboard — job history and the new-clone form:

![Dashboard](docs/screenshots/dashboard.png)

Job review — Claude's rebrand suggestions, editable before you apply them:

![Job review](docs/screenshots/job-review.png)

## Architecture

```mermaid
flowchart TB
    subgraph Entrada
        A[Chat with Claude<br/>MCP server] --> C
        B[Web UI<br/>Next.js] --> C
    end
    C[core/pipeline] --> D[fetcher<br/>isolated Docker]
    D --> E[brand-analyzer]
    E --> F[claude-rebrander<br/>palette + copy + SVG logo]
    F --> G{Human review<br/>in the Web UI}
    G -->|edit| F
    G -->|approve| H[site-rewriter]
    H --> I[exporter<br/>.zip + local preview]
```

Full diagram source: [docs/architecture-diagram.md](docs/architecture-diagram.md)

## Responsible use

Doppel intentionally has **no usage gate** — no confirmation dialog, no license check. It's meant for **study and prototyping**: agency/freelance proposals ("here's how your site could look"), and as a technical showcase. It is not meant to republish a clone of someone else's site as a finished product. Please don't do that.

Doppel also doesn't (and can't) clone backend-dependent behavior: forms, logins, and CMS-driven content stay on the original site's server and won't work in the clone.

## Getting started

**Via Claude (MCP):**
```bash
git clone https://github.com/V0LKBLACKGATE/doppel.git
cd doppel
npm install
npm run build
claude mcp add doppel -- node /absolute/path/to/doppel/mcp-server/dist/index.js
```
> Doppel isn't on npm yet, so `npx doppel-mcp` won't work — point the MCP command at your local build instead. Publishing to npm is planned, not done.

Then, in a chat: *"Clone https://example.com as a brand called Sorriso+, a dental clinic."* Claude prints the banner, bootstraps Docker/Playwright/the local DB on first run, and hands you a `localhost` link to review.

**Via the web app directly:**
```bash
npm install
docker build -f renderer/Dockerfile -t doppel-renderer .
npx prisma migrate deploy --schema prisma/schema.prisma
npm run build
ANTHROPIC_API_KEY=sk-... npm run dev -w web
```
Make sure `ANTHROPIC_API_KEY` is set in your environment before starting — the Claude rebrand step needs it to function.

## Stack

Next.js 15 · TypeScript (strict) · Prisma + SQLite · Playwright · Docker · `@modelcontextprotocol/sdk` · `@anthropic-ai/sdk`

## License

MIT — see [LICENSE](LICENSE).
