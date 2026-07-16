# Besorah Organic Video Lab

Laboratório local de conteúdo orgânico que transforma um briefing em um vídeo
vertical final. O fluxo combina três roteiristas em paralelo, um juiz de
convergência, HeyGen como único provider do vídeo-base e Remotion no acabamento.

O modo mock é o padrão e executa o produto ponta a ponta sem consumir créditos.
Chamadas OpenAI e HeyGen reais são duas feature flags independentes e server-side.

## Stack

- Next.js 16, React 19 e TypeScript estrito;
- Zod para validação de runtime e structured outputs;
- Drizzle ORM + SQLite no MVP;
- OpenAI Responses API para roteiristas e juiz reais;
- HeyGen API v3 para avatar, voz e vídeo-base;
- Remotion 4 para MP4 vertical e SRT;
- Vitest e Playwright.

## Início rápido

Requisitos: Node.js 24+, npm e FFmpeg disponível no `PATH`.

```bash
npm install
npm run setup
npm run dev
```

Abra `http://127.0.0.1:3000/admin/organic-video-lab`.

`npm run setup` aplica migrations idempotentes e cria o MP4-base usado pelo provider
HeyGen mock. Dados e renders ficam em `data/`, ignorado pelo Git.

## Variáveis

Copie `.env.example` para `.env.local` e mantenha as flags reais desligadas até
concluir a configuração:

```env
LLM_REAL_CALLS_ENABLED=false
REELS_RESEARCH_ENABLED=false
HEYGEN_REAL_CALLS_ENABLED=false
APIFY_REAL_CALLS_ENABLED=false
```

Para ativar os roteiristas reais, configure `OPENAI_API_KEY`, os modelos e os preços
por milhão de tokens. Para a HeyGen, configure uma chave nova em `HEYGEN_API_KEY`,
registre o endpoint `/api/webhooks/heygen` e salve o segredo retornado em
`HEYGEN_WEBHOOK_SECRET`. Só então altere `HEYGEN_REAL_CALLS_ENABLED=true`.

Para pesquisar padrões públicos antes dos três roteiristas, habilite
`REELS_RESEARCH_ENABLED=true` junto com as chamadas reais de LLM. A Biblioteca de
Referências mostra os resultados antes da geração: o usuário escolhe até seis
formatos e somente os selecionados entram no briefing dos roteiristas. A pesquisa
registra URLs e evidências, não inventa métricas e não copia a expressão criativa
das referências.

Para produção com apresentador e voz humana, as três flags precisam refletir o
modo desejado no ambiente de produção:

```bash
LLM_REAL_CALLS_ENABLED=true
REELS_RESEARCH_ENABLED=true
HEYGEN_REAL_CALLS_ENABLED=true
```

Também configure `OPENAI_API_KEY`, `HEYGEN_API_KEY` e o segredo do webhook. Ter
somente as chaves cadastradas não ativa chamadas reais. O pipeline rejeita mídia
sem áudio, não vertical, curta/corrompida ou sem a geometria final 1080x1920.

Nunca use prefixo `NEXT_PUBLIC_` em segredos. Credenciais não são persistidas no
banco, respostas da API ou logs.

## Pipeline

1. A UI cria e valida o `VideoBrief`.
2. Os três roteiristas rodam com `Promise.allSettled`.
3. Resultados válidos, falhas, versão, latência, modelo, tokens e custo são auditados.
4. O juiz decide `approved`, `retry` ou `human_review`.
5. Há no máximo duas rodadas adicionais; depois disso a decisão vira
   `human_review`.
6. O plano aprovado cria um job idempotente no HeyGen mock ou v3.
7. Webhook assinado é preferencial; polling com backoff é o fallback.
8. URLs temporárias são baixadas para storage próprio.
9. Um worker Node externo ao Next renderiza `BesorahOrganicVertical` e o SRT.

## Comandos

```bash
npm run lint          # ESLint
npm run typecheck     # TypeScript estrito
npm test              # unidade e integração
npm run build         # build de produção
npm run test:e2e      # fluxo mock no Chromium
npm run render:smoke  # render Remotion de validação
npm run check         # lint + typecheck + testes + build
```

O Playwright captura screenshot e trace em falha e reprova em erros de console,
requests 5xx ou falhas de rede inesperadas. O E2E real permanece fora do comando
padrão para não consumir créditos.

## Estrutura principal

- `src/app/admin/organic-video-lab` — experiência administrativa;
- `src/server/orchestration` — execução paralela e convergência;
- `src/server/providers` — interfaces e providers mock/reais;
- `src/server/db` — schema Drizzle e repositórios;
- `src/remotion` — composição e timeline JSON;
- `migrations` — migrations aplicáveis;
- `prompts` e `schemas` — contratos fornecidos;
- `tests` — unidade, integração e E2E.

## Limites do MVP

- SQLite, storage local e worker por processo são adequados ao MVP local; produção
  deve usar banco, object storage e fila durável gerenciados.
- A HeyGen v3 não documenta cancelamento de render. `cancelVideo()` informa
  operação não suportada; exclusão de vídeo não é usada como falso cancelamento.
- A aprovação humana é registrada no fluxo, mas não inclui postagem automática.
- A Biblioteca de Referências trabalha inicialmente com links públicos e padrões
  abstratos. O envio e a análise de arquivos de terceiros exigem object storage,
  autenticação e atestado de direitos de uso antes de serem habilitados em produção.
- Não há autenticação pré-existente no pacote recebido. Antes de expor a rota fora de
  uma rede confiável, integre o middleware de identidade da plataforma de destino.

Consulte também [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) e os documentos
originais em `docs/`.
