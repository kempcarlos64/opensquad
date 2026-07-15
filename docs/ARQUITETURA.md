# Arquitetura

## Objetivo
Criar vídeos verticais orgânicos para vender o Besorah, usando tendências reais sem copiar o conteúdo de terceiros.

## Pipeline
1. Coletor de tendências
2. Normalizador de performance
3. Extrator de padrões
4. Gerador de briefing
5. Roteirista A — Gancho e retenção
6. Roteirista B — Marca e conversão
7. Roteirista C — Clareza e compartilhamento
8. Juiz de convergência
9. Diretor HeyGen
10. HeyGen API
11. Pós-produção Remotion
12. Controle de qualidade
13. Aprovação humana
14. Exportação e publicação

## Princípio de eficiência
Prioridade de ferramentas:
1. API oficial
2. conector ou scraper autorizado
3. HTTP/parser
4. Playwright API para páginas dinâmicas
5. Playwright MCP para descoberta de fluxo, depuração e testes E2E

Não contornar CAPTCHA, autenticação, limites, paywalls ou controles de acesso.

## Métrica de oportunidade
Não usar apenas visualizações absolutas.

`performance_ratio = views_do_conteudo / mediana_views_ultimos_conteudos_do_perfil`

Outros sinais:
- velocidade de visualizações;
- comentários por mil visualizações;
- compartilhamentos e salvamentos quando disponíveis;
- idade do conteúdo;
- tamanho da conta;
- repetição do mesmo formato em contas diferentes;
- aderência ao público do Besorah.

## Três roteiristas
Os três recebem o mesmo `VideoBrief`, mas têm objetivos e rubricas diferentes.

### Roteirista A
Maximiza os 2 primeiros segundos, retenção e progressão de curiosidade.

### Roteirista B
Conecta dor, mecanismo, prova, posicionamento e CTA do Besorah.

### Roteirista C
Torna o texto natural, fácil de falar, confiável, memorável e compartilhável.

## Convergência
O juiz:
- compara tese, promessa, gancho, sequência, CTA e alegações;
- rejeita factualidade duvidosa;
- calcula acordo semântico;
- combina somente elementos compatíveis;
- pede nova rodada se a nota global for menor que 85/100;
- limita a duas novas rodadas;
- envia para revisão humana se continuar abaixo do limiar.

## HeyGen
Usar a API direta de vídeo para manter avatar, voz e parâmetros consistentes.
Fluxo:
- listar/selecionar avatar e voz;
- criar vídeo;
- armazenar `video_id`;
- aguardar webhook;
- baixar imediatamente o MP4 retornado;
- manter polling como fallback;
- registrar falhas e permitir reprocessamento idempotente.

## Remotion
Recebe:
- MP4 HeyGen;
- roteiro aprovado;
- palavras/frases com tempos;
- arquivo de legendas;
- mapa de B-roll;
- logo e tokens visuais.

Entrega:
- MP4 1080x1920;
- legendas queimadas;
- SRT separado;
- capa;
- versão limpa;
- relatório de renderização.

## Segurança operacional
- segredos somente no servidor;
- assinatura de webhook verificada;
- URLs temporárias baixadas e armazenadas;
- filas com retentativa exponencial;
- idempotency key por job;
- auditoria de prompts, custos e versões;
- aprovação humana antes de postagem no MVP.
