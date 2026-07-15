# Critérios de aceite

## Agentes
- os três são executados em paralelo;
- cada resposta valida contra JSON Schema;
- falha de um agente não derruba os demais;
- o juiz mostra notas e justificativas;
- nenhuma alegação não verificada é promovida como fato.

## HeyGen
- API key nunca aparece no navegador;
- criação retorna e salva `video_id`;
- webhook é autenticado;
- polling funciona como fallback;
- URL temporária é baixada para armazenamento próprio;
- jobs são idempotentes;
- erro pode ser reprocessado.

## Remotion
- 1080x1920;
- 30 fps;
- áudio preservado;
- legendas dentro da safe area;
- quebra de linha legível;
- logo não encobre rosto nem legenda;
- exporta MP4 e SRT;
- não há frames pretos ou áudio cortado.

## UX
- status claro por etapa;
- custo estimado e real;
- mensagens de erro úteis;
- botão de cancelar quando possível;
- modo mock;
- histórico de execuções.

## Testes
- unidade: score/convergência;
- integração: provider HeyGen mock;
- integração: webhook;
- E2E: briefing até preview;
- E2E real opcional atrás de flag.
