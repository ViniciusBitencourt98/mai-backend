# TASK-BE-019 — e-mail, resumo diário e histórico

Base main 5e7b3aa, BE-018 incorporada no PR #20. Implementação Code First;
nenhuma chamada a Gmail real, credencial, migration ou deploy nesta entrega.

## Transporte e configuração futura

ADR-005 deixava API HTTP ou SMTP em aberto. Este recorte escolhe **Gmail API
HTTP com OAuth2 refresh token**, compatível com fetch em Workers e nodejs_compat
para codificação MIME, sem sockets SMTP. A escolha é proposta para revisão e
precisa de PoC real; testes com fetch isolado não são aceite Gmail.

O adaptador real executa POST https://oauth2.googleapis.com/token com grant
refresh_token e então POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send.
Constrói MIME multipart/alternative UTF-8, HTML escapado e texto simples, codificado
base64url. Destinatário vem do usuário persistido ativo, nunca da Queue/HTTP.
Cabeçalhos de destinatário/remetente são validados contra injeção. Subject é
codificado MIME. Não registra corpos/respostas, endereços, tokens, causas ou erros
brutos. Retorna apenas ID observado de mensagem não vazio. HTTP rejeitado,
rede/timeout/resposta inválida têm categorias sanitizadas.

Bindings futuros:

| Nome | Uso |
|---|---|
| EMAIL_DELIVERY_ENABLED | `false` por padrão no Wrangler; somente `true` conecta o transporte |
| GMAIL_CLIENT_ID | Identidade OAuth da aplicação autorizada |
| GMAIL_CLIENT_SECRET | Secret OAuth |
| GMAIL_REFRESH_TOKEN | Secret de consentimento offline para gmail.send |
| GMAIL_FROM | Caixa Gmail autorizada ou alias validado |
| APPLICATION_URL | URL HTTP(S) opcional da aplicação, sem credenciais; gera referência à atividade |
| DATABASE_URL | Binding Neon já usado pela aplicação; não solicitado neste ticket |

Configurar valores localmente em arquivo ignorado e em secrets Workers, nunca
no Git/chat. O OAuth deve ser consentido pelo titular para o escopo mínimo
https://www.googleapis.com/auth/gmail.send. Revisar políticas de consentimento,
expiração/revogação, aliases, cotas e limites da conta. Sem token válido, não há
transporte funcional. Não há fluxo público de OAuth nem credencial predefinida.
Timeouts: 10s token e 15s send. Nenhuma chamada tem retry, inclusive 429/5xx.

## Consumer, idempotência e resultado incerto

1. Reutiliza validação de mensagem, owner persistido, estado/vigência/preferências
   da BE-018. PENDING/terminais não são enviados.
2. Monta conteúdo lendo somente fonte própria ou dashboard próprio. Erro nessa
   fase ainda permite retry técnico, pois não existe tentativa de envio.
3. Reserva PUBLISHED por 300s via transação com lock por usuário/CAS e log RESERVED.
   Outra mensagem concorrente não obtém uma segunda reserva.
4. Revalida intenção/lease e seu prazo antes de chamar o adaptador.
5. Aceite real com ID → accepted → SENT + PROVIDER_ACCEPTED persistidos; ack.
   Falha de transporte → FAILED com categoria NETWORK/PROVIDER_REJECTED/INTERNAL;
   ack, sem retry automático.
6. Aceite observado e falha na confirmação → mantém reserva (ou estado concorrente),
   log operacional DELIVERY_UNCERTAIN, ack. Não grava FAILED por cima de um aceite
   observado. Falha ao persistir uma falha também fica incerta e recebe ack.

Após adquirir reserva de entrega, erros são contidos e não solicitam reenvio.
Se o processo morrer, redelivery verá RESERVED/PUBLISHED e será ignorada; Cron
não recupera essa fase. Se o processo morrer antes de chamar Gmail, isso pode
perder um envio: é a escolha conservadora para evitar duplicidade. Reservas
incertas exigem reconciliação manual futura, sem endpoint de reprocessamento.
O log operacional não substitui auditoria persistida quando o banco está fora.
Não há exatamente uma vez entre banco e provedor. Mudanças depois da última
validação e durante a chamada podem competir com o envio; não há cancelamento
atômico de efeito externo. SENT significa aceite, não caixa de entrada/leitura.

Com EMAIL_DELIVERY_ENABLED diferente de true mantém comportamento BE-018:
ack da intenção válida PUBLISHED sem mudança de estado e sem envio. Ativação
posterior não reprocessa automaticamente intenções já consumidas.

## Conteúdo e resumo

Templates identificam Projeto MAI/tipo/título/data e fuso; tarefas usam data
civil e indicação “sem horário”, mesmo quando o scheduler usa âncora técnica 09h.
Eventos/publicações usam instante efetivo resolvido pela fonte existente,
incluindo ocorrência movida. URL opcional usa `/app/tarefas|eventos|publicacoes/:id`;
o frontend deve conferir esses caminhos antes de configurar APPLICATION_URL.
HTML dinâmico escapado, alternativa texto simples e nenhum dado de outra conta.

Cron executa planejamento antes do dispatcher. Seleção SQL limitada a 100 usuários
ativos com emailEnabled e dailyDigestEnabled, horário local devido e anti-join
excluindo outbox DAILY_DIGEST no dia local. Sem paginação que repita eternamente os
primeiros já planejados; erros de banco propagam falha ao Cron. O serviço revalida
preferências sob lock e reutiliza unique/idempotência owner+dia. Uma intenção
cancelada/falha não é recriada. O horário pode já ter passado **somente para hoje**;
não há backfill de dias anteriores. Gaps DST são ignorados; folds usam primeiro
instante conforme resolveLocal existente. Janela/gates da BE-016 preservados para
lembretes. Sem schema/migration nova.

Resumo usa DashboardService/CalendarService, sem motor recorrente duplicado:
tarefas pendentes do dia, atrasadas nos últimos 30 dias, eventos sobrepostos ao
dia (incluindo meia-noite), publicações não publicadas previstas hoje. Limite 20
por lista, com aviso hasMore explícito; não promete todas as atividades. Usa dia
civil da intenção e timezone persistido, validade comparada às preferências
atuais. Dia sem itens gera mensagem “Nenhuma atividade”. Limites de fontes e
expansão do dashboard ainda podem recusar a montagem; erro antes da reserva é
infraestrutura/preparação, não aceite de envio. Em preferências DST gap ou usuários
repetidamente recusados pelo limite de intenções, a seleção pode gastar posições
do lote; monitorar backlog/custo antes de produção.

## Histórico HTTP

`GET /notifications`: page 1–10000 (default 1), limit 1–100 (default 20),
status, type, from/to ISO com offset, order asc/desc (default desc). Período usa
scheduledAt em [from,to), ordena scheduledAt/id na mesma direção. Retorna
`{items:[Notification],page:{number,limit,hasMore}}`.

`GET /notifications/:id`: retorna Notification própria; ausente/externa dá 404.
Query de detalhe vazia. UUID inválido/query desconhecida ou repetida dão 400.
Ambos exigem sessão ativa, no-store/CORS com credenciais; GET sem mutação não
exige CSRF. Não há POST/reenvio. DTO contém id/type/sourceType/sourceId,
occurrenceDate/status, scheduledAt/publishedAt/sentAt/failedAt/cancelledAt,
errorCategory/createdAt/updatedAt. Sem owner, lease, token, ID de provedor ou
conteúdo. DeliveryLog permanece interno e persistente para transições.
Contrato completo em openapi.json; é a referência para próxima task frontend.

## Validação e pendências

Testes isolados cobrem MIME/HTML/texto, três tipos, resumo vazio/com itens,
fuso, transporte OAuth/send com fetch substituído, categorias, ausência de retry,
aceite e falha posterior, planner diário/anti-join/DST, API autenticada, owner,
filtros/paginação e projeção sem leases. Suítes anteriores de concorrência,
recorrência, DST, digest único e transições persistentes continuam executadas.
Mocks não validam locks/rollback PostgreSQL nem entrega Gmail.

Pendentes: PoC OAuth/Gmail com destinatários autorizados, persistência Neon,
corrida consumer/domínio, custo/plano SQL do anti-join, fila/DLQ/Cron remotos,
reconciliação de resultado incerto e integração frontend. Nenhuma dessas ações
foi executada ou autorizada implicitamente por testes/build locais.
