# HeyGen v3 — configuração operacional

Esta aplicação usa somente a API v3:

- `GET /v3/avatars/looks` para IDs de avatar utilizáveis;
- `GET /v3/voices` para vozes públicas e privadas;
- `POST /v3/videos` com `Idempotency-Key` para criação;
- `GET /v3/videos/{video_id}` para status e artefatos;
- webhooks `avatar_video.success` e `avatar_video.fail`.

## Registro do webhook

Crie o endpoint gerenciado pela HeyGen apontando para:

```text
https://SEU_DOMINIO/api/webhooks/heygen
```

Salve o segredo exibido uma única vez como `HEYGEN_WEBHOOK_SECRET`. A implementação
verifica `Heygen-Signature` sobre o corpo bruto, `Heygen-Timestamp` com tolerância de
cinco minutos e deduplica `Heygen-Event-Id`.

Como o segredo só aparece depois da criação, use `HEYGEN_WEBHOOK_SETUP_MODE=true`
somente para a primeira verificação de alcance no painel. Assim que o painel mostrar
o segredo, salve-o em `HEYGEN_WEBHOOK_SECRET`, altere o setup mode para `false` e
reinicie/reimplante a aplicação. Nesse modo temporário, o endpoint retorna `202` e
não processa nenhum evento.

O webhook é um sinal. O status autoritativo continua sendo consultado em
`GET /v3/videos/{id}` antes de baixar o arquivo.

## Segurança e custos

- A chave fica apenas em `HEYGEN_API_KEY` no servidor.
- `HEYGEN_REAL_CALLS_ENABLED=false` é o padrão.
- A chave de idempotência é estável e também possui unicidade local.
- O download não encaminha `X-Api-Key` à URL temporária.
- URLs temporárias não entram em logs e são copiadas imediatamente para storage.
- Respostas `429` respeitam `Retry-After`; o polling usa backoff exponencial.

Não há cancelamento de render documentado na v3. `DELETE /v3/videos/{id}` remove um
vídeo e não é usado para simular cancelamento.
