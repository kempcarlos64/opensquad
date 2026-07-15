# MVP de hoje

## Escopo obrigatório
- rota `/admin/organic-video-lab`;
- criação manual de briefing;
- execução paralela dos três roteiristas;
- tela comparativa dos três resultados;
- juiz de convergência;
- edição manual do roteiro final;
- seleção de avatar e voz HeyGen;
- criação de vídeo pela HeyGen;
- webhook e polling de fallback;
- armazenamento do MP4;
- composição Remotion vertical;
- legenda dinâmica;
- logo Besorah;
- exportação e download;
- histórico de jobs;
- modo mock sem consumir créditos;
- teste E2E com Playwright.

## Fora do MVP
- postagem automática;
- automação de DM;
- dezenas de contas;
- coleta irrestrita de redes sociais;
- aprendizado automático sem revisão;
- geração autônoma diária em produção.

## Implementação em blocos
### Bloco 1 — base
Banco, tipos, rotas, UI e modo mock.

### Bloco 2 — agentes
Execução paralela, schemas estruturados e convergência.

### Bloco 3 — HeyGen
Provider, criação, status, webhook, download e armazenamento.

### Bloco 4 — Remotion
Composição vertical, legendas e marca.

### Bloco 5 — QA
Playwright, logs, tratamento de erro e documentação.

## Definição de concluído
Um usuário autorizado consegue:
1. criar briefing;
2. rodar três roteiristas;
3. aprovar roteiro;
4. gerar vídeo HeyGen;
5. receber o vídeo;
6. renderizar versão final 9:16;
7. assistir e baixar o resultado;
8. repetir o fluxo sem duplicar cobranças por clique duplo.
