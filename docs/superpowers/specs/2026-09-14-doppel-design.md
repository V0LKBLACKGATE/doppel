# Doppel — Design

**Data:** 2026-09-14
**Status:** aprovado para virar plano de implementação
**Portfólio:** entra no guarda-chuva VØLK // BLACKGATE (mesmo padrão de README/assinatura dos outros apps: Sentinela, Claude Agent Starter, GitHub Action de Code Review)

## 1. Objetivo

Doppel é uma ferramenta que clona um site existente (URL) e gera uma versão rebrandada (logo, cores e textos trocados para uma nova marca/nicho), com fidelidade visual real ao original. Serve a dois casos de uso:

1. **Prospecção/agência** — gerar rapidamente uma proposta visual ("olha como seu site ficaria nesse estilo") pra apresentar a um cliente.
2. **Estudo/demonstração técnica** — vitrine de competência em scraping, automação de browser, e uso do Claude como motor de decisão de design/copy (não só chamada de API cosmética).

Roda **100% local**, na máquina de quem instalar — não existe backend hospedado pelo autor. Custo de uso da API Claude é do usuário que instala, com a própria chave.

## 2. Interfaces de uso

Duas portas de entrada para o mesmo pipeline, compartilhando o mesmo core e o mesmo banco local:

- **Servidor MCP** (`doppel-mcp`, via `npx`) — permite usar o Doppel diretamente de dentro de uma conversa com o Claude (Claude Code ou Claude Desktop): o usuário pede para instalar/clonar, o Claude chama as ferramentas do MCP.
- **UI Web** (Next.js, `localhost`) — onde a revisão visual de fato acontece: preview navegável do clone, comparação lado a lado com o original, edição das sugestões de rebrand do Claude, aprovação e download do pacote exportado.

A revisão visual lado a lado **não acontece dentro do chat** — o fluxo por MCP roda o pipeline até "pronto para revisão" e devolve um link `localhost` da UI web para o usuário continuar lá.

## 3. Escopo de clonagem e fidelidade

- Suporta sites estáticos (HTML/CSS) e sites JS-pesados (SPA), com fallback automático: tenta scraping direto (Cheerio) primeiro, cai para renderização com browser headless (Playwright) se detectar pouco conteúdo estático.
- Rastreia páginas do mesmo domínio até um limite padrão de **20 páginas**, respeitando `robots.txt`, para permitir navegação multi-página dentro do preview.
- Fidelidade alta por design: o `site-rewriter` **preserva a estrutura original** (HTML/CSS/JS baixados) e faz apenas trocas cirúrgicas (imagem do logo, valores de cor da paleta antiga → nova, textos identificados como marca/copy). Não recria o site do zero.
- **Limitação documentada (não é bug, é escopo):** comportamento que depende do backend do site original (formulários que enviam para a API deles, login, conteúdo dinâmico de CMS/banco de dados) não funciona no clone — nenhum clonador de front-end resolve isso. Fica explícito no README para não prometer o que não se entrega.

## 4. Arquitetura — componentes

Monorepo com workspaces (npm/pnpm), 3 pacotes compartilhando core e banco:

```
doppel/
  core/              # lib compartilhada, sem UI
    fetcher/         # Cheerio + fallback Playwright, crawl multi-página
    brand-analyzer/  # detecta logo, paleta dominante, nome da marca
    claude-rebrander/# chama Claude: paleta nova, copy reescrita, logo SVG
    site-rewriter/   # aplica as trocas no HTML/CSS baixado
    exporter/        # empacota .zip, serve preview local
  mcp-server/        # entrypoint MCP (npx doppel-mcp), inclui o banner
    src/
      tools/         # clone_site, list_clones, get_clone_preview, export_clone
      banner.ts      # assinatura VØLK // BLACKGATE portada do volk.ps1/.bat
  web/               # Next.js — UI de preview/revisão/export
  renderer/           # Dockerfile do container de renderização isolada (Playwright + Chromium)
  prisma/
    schema.prisma    # CloneJob (tabela única, banco SQLite compartilhado)
  README.md / README.pt-BR.md
```

### 4.1 Isolamento de renderização (Docker)

O Doppel processa URLs de terceiros não confiáveis. A etapa de fetch/render (Playwright + Chromium) roda dentro de um container Docker isolado (`doppel-renderer`), separado do host — contém qualquer comportamento abusivo de um site malicioso. MCP server e Web UI rodam direto em Node e apenas orquestram, chamando o renderer via Docker.

### 4.2 Modelo de dados (Prisma / SQLite)

Uma tabela única, sem normalização excessiva (YAGNI):

```prisma
model CloneJob {
  id            String   @id @default(cuid())
  sourceUrl     String
  brandName     String
  niche         String?
  status        String   // fetching | analyzing | rebranding | pronto_para_revisao | aplicado | exportado | erro
  errorReason   String?
  colorPalette  String?  // JSON
  copyChanges   String?  // JSON
  logoSvg       String?
  previewPath   String?
  exportPath    String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

## 5. Pipeline

Idêntico nos dois canais de entrada (MCP ou UI):

1. URL entra → `fetcher` baixa o site dentro do container `doppel-renderer` (com fallback headless se precisar), respeitando `robots.txt` e o limite de 20 páginas.
2. `brand-analyzer` identifica logo, paleta de cor dominante e nome da marca atual.
3. `claude-rebrander` recebe o perfil de marca + nome/nicho novo informado pelo usuário, e devolve: paleta de cores nova, textos reescritos (headlines, CTAs, nav), e um logo novo em **SVG gerado por texto pelo próprio Claude** (sem depender de API de geração de imagem paga).
4. Status vira `pronto_para_revisao` — se veio do MCP, o Claude devolve o link `localhost` da UI para o usuário revisar/ajustar visualmente.
5. Usuário aprova na UI (pode editar qualquer sugestão antes) → `site-rewriter` aplica as trocas de verdade → `exporter` gera o `.zip` e o preview final navegável.

## 6. MCP — ferramentas expostas

- `clone_site(url, brand_name, niche?)` — roda o pipeline completo até `pronto_para_revisao`, retorna resumo + link de preview.
- `list_clones()` — histórico de jobs (do banco compartilhado).
- `get_clone_preview(job_id)` — link de preview de um job existente.
- `export_clone(job_id)` — caminho do `.zip` de um job já aprovado.

## 7. Fluxo de instalação (boot do MCP)

1. Usuário adiciona o Doppel no Claude (`claude mcp add doppel -- npx doppel-mcp`) e pede para instalar/usar.
2. No start do processo, imprime o banner do lobo + assinatura VØLK // BLACKGATE — conteúdo ANSI portado do `volk.ps1`/`.bat` (`Documents/volk-signature-cmd`) para dentro do pacote Node como asset próprio, não chamando o script `.ps1` externamente (garante que funcione em Mac/Linux também, não só Windows).
3. Checagens/bootstrap automático, nesta ordem:
   - Versão do Node.
   - Docker instalado? Se não, tenta instalar via gerenciador de pacote do SO (`winget`/`brew`/`apt`); se não conseguir de forma silenciosa (ex: Docker Desktop no Windows pedindo elevação/reinício), mostra instrução clara de 1 passo para o usuário concluir manualmente — **não promete 100% de silêncio em todo cenário, é honesto sobre a limitação**.
   - Builda/puxa a imagem do `doppel-renderer` e sobe o container.
   - Inicializa o SQLite (`prisma migrate`).
4. Ferramentas MCP ficam registradas, pronto para uso via chat ou abrindo a UI web (`localhost`).

## 8. Tratamento de erros

Cada job tem `status` explícito e nunca falha silenciosamente — erro sempre visível tanto no retorno do MCP quanto na UI:

- Site bloqueia bot / desafio Cloudflare → mensagem clara, job marcado `erro` com motivo.
- `ANTHROPIC_API_KEY` ausente/inválida → falha detectada no boot do MCP, não no meio do pipeline.
- Timeout de renderização headless (30s) → job marcado `erro`, permite retry.
- Falha de disco/permissão no export → capturada e refletida no `errorReason` do job.
- Docker indisponível → mensagem de instrução, não crash.

## 9. Testes

- Unitários (Vitest) para os módulos do `core/`: lógica de fallback do `fetcher`, heurística do `brand-analyzer`, substituição do `site-rewriter`.
- Integração do pipeline completo contra HTML de fixture local (sem depender de internet real no CI).
- Testes dos handlers de ferramenta do MCP (mockando o core).
- Sem E2E pesado de browser real no CI (evita flakiness) — mesmo padrão de qualidade dos outros apps do portfólio (tsc + lint limpos).

## 10. README / posicionamento (portfólio)

Mesmo padrão já usado no Sentinela:

- Badges: Built with Claude, stack (Next.js, TypeScript strict, Prisma/SQLite, Docker), license MIT.
- Banner com logo oficial do Claude + assinatura VØLK // BLACKGATE.
- Prints reais (light/dark) da UI de preview/revisão.
- Diagrama de camadas (Mermaid) explicando o pipeline.
- Seção de posicionamento como engenheiro de IA (Claude como motor de decisão, não só chamada de API).
- **Seção de boas práticas/uso responsável:** deixa claro que é ferramenta de estudo/prototipagem/prospecção — não deve ser usada para republicar clone de um concorrente como produto final. Sem fricção técnica para rodar (sem confirmação obrigatória, sem bloqueio), só orientação clara em texto.
- README bilíngue (`README.md` en + `README.pt-BR.md`), seguindo o padrão do GitHub Action.

## 11. Fora de escopo (v1)

- Não é um SaaS público hospedado — só local.
- Não gera imagem de logo via modelo de geração de imagem (custo/plano indisponível) — logo é SVG gerado por texto pelo Claude.
- Não resolve comportamento dependente de backend do site original (forms, login, CMS).
- Sem autenticação/multiusuário — ferramenta de uso individual local.
- Sem deploy automático do clone para hospedagem externa — só export `.zip` e preview local.

## 12. Riscos

- **Legal/ética:** mitigado via README com boas práticas de uso (estudo/prospecção), sem bloqueio técnico — decisão explícita do usuário.
- **Segurança (conteúdo malicioso de terceiros):** mitigado via isolamento em container Docker do renderer.
- **Instalação do Docker sem atrito total:** risco residual no Windows (elevação/reinício) — mitigado com instrução manual clara quando o caminho automático falhar.
