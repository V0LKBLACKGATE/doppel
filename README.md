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

Doppel is installed and driven entirely **from a chat with Claude** (Claude Code or Claude Desktop) via the bundled MCP server — say "clone this site as Brand X" and Claude bootstraps Docker/the local DB/the web UI on first run, then hands you a `localhost` link where you review and edit the rebrand side by side with the original.

Everything runs on `localhost`, on your own machine. There is no hosted backend. Setting `ANTHROPIC_API_KEY` is optional — it's only for the automatic palette/copy/logo proposal, uses your own API usage at your own cost, and you can skip it entirely and fill those fields in yourself.

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

<img src="docs/architecture.svg" alt="Doppel architecture: Chat with Claude via the MCP server drives core/pipeline, which runs fetcher (isolated Docker) → brand-analyzer → claude-rebrander, loops through human review in the local Web UI, then site-rewriter → exporter" width="100%">

(Diagram labels are in Portuguese — full source: [docs/architecture.svg](docs/architecture.svg))

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

Then, in a chat: *"Clone https://example.com as a brand called Sorriso+, a dental clinic."* Claude prints the banner, bootstraps Docker/Playwright/the local DB and the web app on first run, and hands you a `localhost` link to review — no separate terminal command needed.

## Local development

Working on Doppel's own code (not just using it)? Run the web app and its isolated preview server directly, without going through Claude/MCP:
```bash
npm install
docker build -f renderer/Dockerfile -t doppel-renderer .
npx prisma migrate deploy --schema prisma/schema.prisma
npm run build
npm run dev -w web
```
`ANTHROPIC_API_KEY` is **optional**: set it (`ANTHROPIC_API_KEY=sk-... npm run dev -w web`) if you want Claude to propose the palette/copy/logo automatically. Without it, that step fails but the clone still completes — the review screen lets you fill in the palette, copy and logo yourself and export, no API usage at all. `npm run dev -w web` starts both the Next.js app and `preview-server.mjs` (the isolated origin cloned sites actually render in — see that file for why).

## Stack

Next.js 15 · TypeScript (strict) · Prisma + SQLite · Playwright · Docker · `@modelcontextprotocol/sdk` · `@anthropic-ai/sdk`

## License

MIT — see [LICENSE](LICENSE).
