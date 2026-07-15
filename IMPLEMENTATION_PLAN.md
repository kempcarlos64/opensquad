# Plano de implementação

## Auditoria

O diretório recebido contém apenas especificações (`docs`, `prompts`, `schemas` e
`sql`). Não há aplicação, histórico Git, autenticação, ORM, filas, storage ou design
system existente para reaproveitar. A implementação será uma base mínima nova, sem
alterar os contratos fornecidos.

## Stack e decisões

- Next.js + React + TypeScript estrito para a rota administrativa e APIs server-side.
- Zod como validação de runtime e fonte tipada dos contratos de domínio.
- Drizzle ORM + SQLite no MVP, com migrations SQL, foreign keys, índices e chaves de
  idempotência; `DATABASE_URL` mantém o banco configurável.
- Providers isolados para LLM, HeyGen e storage local. Todos iniciam em modo mock;
  chamadas reais dependem de feature flags server-side.
- Remotion para a composição `BesorahOrganicVertical`, com timeline JSON; MP4 e SRT
  são persistidos no storage local do MVP.
- Vitest para unidade/integração e Playwright para o fluxo mock ponta a ponta.

## Etapas

1. Criar a base, schemas Zod, banco, migration e repositórios.
2. Implementar providers mock e o pipeline paralelo de três roteiristas + juiz, com
   até duas rodadas de retry e fallback para revisão humana.
3. Implementar a API e a UI completa em `/admin/organic-video-lab`, incluindo
   histórico, estados, edição e idempotência.
4. Integrar o provider HeyGen real atrás de `HEYGEN_REAL_CALLS_ENABLED=false`, com
   webhook, polling, download imediato e cancelamento somente quando suportado.
5. Implementar a composição e o render Remotion dirigidos por JSON, além de SRT.
6. Adicionar logs/auditoria, documentação, setup e testes.
7. Executar lint, typecheck, testes, build e E2E; corrigir até o fluxo mock passar.

## Segurança

Segredos nunca serão serializados para o cliente, persistidos no banco, incluídos em
logs ou versionados. A chave HeyGen deve existir somente em `.env.local`; o modo real
permanece desligado por padrão para evitar consumo acidental de créditos.
