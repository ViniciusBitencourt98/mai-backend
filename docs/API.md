# Contrato inicial de API REST (`/api/v1`)

**Importante:** catálogo de endpoints proposto, não contrato já implementado. O bootstrap deve produzir OpenAPI (manual ou gerado) e exemplos de DTOs Zod; evitar mudanças silenciosas nas rotas.

## Convenções

- JSON e HTTP sem estado; auth por sessão/credencial definida no PR inicial. `/health` público sem dados sensíveis.
- Sucesso: `200` leitura/edição, `201` criação, `204` deleção quando apropriado; falhas `400/401/403/404/409/422/429/500` conforme semântica.
- Erro: `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [] }, "requestId": "..." }`.
- Coleções: `{ "items": [], "page": { "limit": 20, "nextCursor": null } }`; definir cursor vs offset uma vez, de forma uniforme.
- Campos de data ISO 8601; data civil `YYYY-MM-DD`; timecodes em milissegundos no transporte.
- `POST` e `PATCH` somente com campos permitidos; resposta nunca expõe secrets. `PATCH` aceita `null` explicitamente para desvincular.

## Rotas

| Método | Caminho | Objetivo |
|---|---|---|
| GET | `/health` | Estado operacional básico |
| GET/PATCH | `/api/v1/me` | Perfil e preferências |
| POST | `/auth/login` | Login por e-mail/senha (implementado) |
| POST | `/auth/logout` | Revogar sessão (implementado) |
| GET/POST | `/api/v1/projects` | Listar/criar projetos |
| GET/PATCH/DELETE | `/api/v1/projects/:id` | Consultar/editar/arquivar projeto |
| GET/POST | `/api/v1/tasks` | Listar/criar tarefas |
| GET/PATCH/DELETE | `/api/v1/tasks/:id` | Consultar/editar/cancelar tarefa |
| POST | `/api/v1/tasks/:id/complete` | Concluir tarefa/ocorrência |
| GET/POST | `/api/v1/events` | Listar/criar eventos |
| GET/PATCH/DELETE | `/api/v1/events/:id` | Consultar/editar/cancelar evento ou série conforme escopo |
| PATCH/DELETE | `/api/v1/events/:id/occurrences/:key` | Alterar/cancelar ocorrência única |
| GET/POST | `/api/v1/notes` | Notas livres |
| GET/PATCH/DELETE | `/api/v1/notes/:id` | Detalhes/editar/excluir |
| GET/POST | `/api/v1/decoupages` | Decupagens |
| GET/PATCH/DELETE | `/api/v1/decoupages/:id` | Detalhes/editar/excluir |
| POST/PATCH/DELETE | `/api/v1/decoupages/:id/segments[/:segmentId]` | Trechos de timecode |
| GET/POST | `/api/v1/publications` | Publicações |
| GET/PATCH/DELETE | `/api/v1/publications/:id` | Publicação individual |
| GET | `/api/v1/calendar?from=&to=&types=` | Itens da janela da agenda, incluindo ocorrências |
| GET | `/api/v1/dashboard?date=` | Resumo do dia |
| GET/PATCH | `/api/v1/notification-preferences` | Preferências e horário de resumo |
| GET | `/api/v1/notifications` | Histórico de lembretes/envios |
| GET | `/api/v1/exports/events.ics?from=&to=` | Exportação de agenda/eventos |

**Rotas de jobs:** Cron/Queue bindings protegidos pelo próprio ambiente Cloudflare, sem tornar endpoints de disparo públicos. Eventual endpoint administrativo de reenvio manual deve exigir autenticação e autorização forte, mais trilha de auditoria.

## Filtros principais

`q`, `status`, `priority`, `projectId`, `eventId`, `hasLink`, `from`, `to`, `limit`, `cursor`, `sort`. Validação no servidor e `limit` máximo (ex.: 100); busca considera somente recursos do proprietário.

## Padrões de DTO

- `CreateNote`: `{title: string, content?: string, tags?: string[], projectId?: uuid|null, eventId?: uuid|null}`.
- `PatchNote`: campos parciais, `projectId: null` para desvincular.
- `CreateTask`: `{title, description?, priority?, dueDate? | dueAt?, projectId?, reminder?}`; explicitar timezone de prazo.
- `CreateEvent`: `{title, startAt, endAt, recurrenceRule?, projectId?, location?}`.
- `CreateDecoupageSegment`: `{position, startMs?, endMs?, description, observations?}`.

As descrições acima são esboços sem validação integral. Cada feature deve formalizar contrato e exemplos em testes de schema.


## Autenticação implementada — F1-01 a F1-04

Os endpoints de autenticação desta entrega são **`/auth/*`**, conforme TASK-BE-003.
As demais rotas `/api/v1` do catálogo continuam propostas. `GET /auth/me` consulta
a sessão atual e não substitui silenciosamente o futuro endpoint de perfil editável.
O contrato formal está em [openapi.json](openapi.json).

- `POST /auth/login`: JSON estrito `{email, password}`. E-mail é normalizado
  para minúsculas; senha não sofre normalização. Exige `Origin` explicitamente
  confiável. Resposta 200 `{user: {id, email, name, preferences}, expiresAt, csrfToken}`
  e cookie de sessão HttpOnly. Não retorna o token de sessão no JSON.
- `GET /auth/me`: cookie válido obrigatório; 200 com o mesmo DTO público e
  token CSRF da sessão. Sem cookie ou sessão válida, 401.
- `POST /auth/logout`: exige cookie, Origin confiável e `X-CSRF-Token` recebido
  no login/me. Revoga no banco e limpa o cookie com 204. Sessão ausente,
  expirada ou revogada: 401; origem/token CSRF inválido: 403.

Todos esses responses usam `Cache-Control: no-store`. Falhas seguem o envelope
padronizado e não retornam senha, hash ou conteúdo interno. Login inválido e
usuário inexistente usam o mesmo 401 `INVALID_CREDENTIALS`. Entradas inválidas:
400; mídia não JSON no login: 415; limite de tentativas: 429 e `Retry-After`.
Não há cadastro público. Ver [ADR-001](ADR-001-AUTHENTICATION.md) para cookies,
CSRF, limites e criação da primeira usuária de desenvolvimento.

## Projetos implementados — TASK-BE-004 (F2-01/F2-02)

O contrato implementado usa `/projects`, conforme o ticket, sem prefixo `/api/v1`.
O catálogo acima permanece uma proposta para os outros módulos. Não há DELETE.

- `GET /projects`: `{items: Project[], page: {number, limit, hasMore}}`.
  Paginação offset com `page=1`, `limit=20` (máximo 100), `page` máximo 1.000.000.
  `q` pesquisa nome sem distinguir maiúsculas; `status=ACTIVE|ARCHIVED`;
  `sort=name|createdAt|updatedAt` (padrão updatedAt), `order=asc|desc` (padrão desc).
  Desempate sempre por UUID ascendente. Alterações concorrentes podem deslocar páginas.
  `includeArchived=false` por padrão; para buscar arquivados envie
  `includeArchived=true&status=ARCHIVED`. Filtros se combinam por AND.
- `GET /projects/:id`: retorna Project, inclusive arquivado.
- `POST /projects`: nome obrigatório (trim, 1–200 caracteres), descrição opcional
  até 10.000, cor `#RRGGBB`, datas civis opcionais `startDate` e `dueDate`,
  status opcional (padrão ACTIVE). Retorna 201 e `Location: /projects/{id}`.
- `PATCH /projects/:id`: ao menos um campo editável; ausência preserva, `null`
  limpa descrição/cor/datas. Nome/status não aceitam null. O par de datas final
  deve satisfazer `dueDate >= startDate`. Status também sincroniza archivedAt.
- `POST /projects/:id/archive` e `/restore`: sem corpo ou `{}`; idempotentes.
  Arquivar preserva a data do primeiro arquivamento; restaurar limpa archivedAt.

Todos exigem sessão e usam `Cache-Control: no-store`. Mutações exigem Origin
confiável e X-CSRF-Token de login/me, inclusive PATCH. CORS permite credenciais e
PATCH nessas rotas. `ownerId` vem somente da sessão; campos desconhecidos são
rejeitados. Projeto externo e UUID inexistente retornam o mesmo 404 NOT_FOUND.
401 significa sessão inválida/ausente; 403 indica CORS/CSRF; 400 indica validação,
UUID, JSON ou query inválida; POST/PATCH JSON exigem application/json (415).
O envelope de erro mantém `details: []`; não reflete valores enviados.
Os schemas, formatos e exemplos completos estão em [openapi.json](openapi.json).

Exemplo de criação (cookie e CSRF obtidos via autenticação):
```json
{"name":"Documentário MAI","color":"#00AAFF","startDate":"2026-11-13","dueDate":"2026-12-01"}
```
Projetos não criam nem tornam obrigatórios vínculos em tarefas/eventos/notas/
decupagens. Esses módulos e a listagem de associados permanecem tickets próprios.

## Anotações implementadas — TASK-BE-005

As rotas implementadas são `/notes` (sem `/api/v1`), sem DELETE.

| Método | Rota | Resposta |
|---|---|---|
| GET | `/notes` | 200 `{items: Note[], page: {number, limit, hasMore}}` |
| GET | `/notes/:id` | 200 Note, inclusive arquivada |
| POST | `/notes` | 201 Note e `Location: /notes/{id}` |
| PATCH | `/notes/:id` | 200 Note |
| POST | `/notes/:id/archive` | 200 Note, arquivamento idempotente |
| POST | `/notes/:id/restore` | 200 Note, archivedAt=null |

Note contém id, title, content, tags, ownerId, projectId, createdAt, updatedAt e
archivedAt. Timestamps UTC ISO 8601; projectId e archivedAt podem ser null.
Criação mínima: `{"title":"Ideia para gravação"}`; content padrão `""`, tags `[]`,
projectId null. Título trim 1–200, conteúdo texto simples até 50.000 caracteres
(preservado literalmente; frontend deve renderizar como texto), no máximo 20 tags
antes da deduplicação, cada uma trim/minúsculas com 1–50 caracteres. Sem catálogo
ou renomeação global de tags. Só projectId aceita null nos inputs. PATCH exige ao
menos um campo permitido; ausência preserva, tags substitui a lista inteira,
`{"content":"","tags":[],"projectId":null}` limpa texto/tags/vínculo sem excluir nota.
Archive/restore aceitam sem corpo ou `{}` e preservam conteúdo/vínculo/tags;
arquivar novamente preserva archivedAt original. Nenhuma alteração em cascata ao
arquivar projeto; é permitido associar projeto arquivado do mesmo proprietário.

Filtros (todos combinados por AND): `q` substring literal do título sem distinguir
maiúsculas (trim, máximo 200), `tag` uma tag exata normalizada, `projectId` UUID,
`withoutProject=true` para notas sem vínculo. projectId e withoutProject=true
juntos retornam 400. Projeto inexistente ou externo na listagem resulta em lista
vazia, sem revelar existência. `includeArchived=false` por padrão, true inclui
ambos; `page=1` (máximo 1.000.000), `limit=20` (1–100), `sort=updatedAt|createdAt`,
`order=desc|asc`, desempate id ascendente. Offset não garante snapshot concorrente.
Exemplo: `/notes?tag=filmagem&withoutProject=true&sort=createdAt&order=asc`.
Queries desconhecidas, repetidas ou malformadas retornam 400.

Sessão obrigatória em todos os endpoints; mutações exigem Origin confiável e
X-CSRF-Token. CORS com credenciais/PATCH e Cache-Control no-store. ownerId vem
somente da sessão. 401 sem sessão válida; 403 CORS/CSRF; 404 indistinguível para
nota/projeto externo ou inexistente; 400 validação/JSON inválido; 413 acima de
100 KiB; 415 para POST/PATCH sem application/json; 500 para falhas internas.
Envelope padrão de erro com details vazio, sem refletir conteúdo privado.
Schemas e exemplos completos em [OpenAPI](openapi.json). Sem vínculos com eventos
ou implementação de outros módulos nesta tarefa.

## Decupagens implementadas — TASK-BE-006

| Método | Rota | Resposta |
|---|---|---|
| GET | `/decupages` | 200 `{items: Decupage[], page: {number,limit,hasMore}}` |
| GET | `/decupages/:id` | 200 Decupage com `segments` em ordem |
| POST | `/decupages` | 201 Decupage e Location |
| PATCH | `/decupages/:id` | 200 Decupage |
| POST | `/decupages/:id/archive` | 200 Decupage |
| POST | `/decupages/:id/restore` | 200 Decupage |
| POST | `/decupages/:id/segments` | 201 `{items: Segment[]}` |
| PATCH | `/decupages/:id/segments/:segmentId` | 200 `{items: Segment[]}` |
| DELETE | `/decupages/:id/segments/:segmentId` | 200 `{items: Segment[]}` |
| PATCH | `/decupages/:id/segments/reorder` | 200 `{items: Segment[]}` |

Criação mínima `{"title":"Entrevista"}`. description opcional/null (até 50.000),
tags normalizadas como nas notas e projectId opcional/null. Só projetos próprios,
inclusive arquivados. PATCH parcial; null limpa descrição/vínculo e [] limpa tags.
Campos: id,title,description,tags,ownerId,projectId,createdAt,updatedAt,archivedAt.
GET individual inclui segmentos; listagem e outras respostas de pai não incluem.
Sem exclusão definitiva da decupagem. Arquivamento/restauração idempotentes
(sem corpo ou {}), preservam segmentos e projeto. Segmentos podem ser editados
mesmo em decupagens arquivadas.

Listagem: page=1 (até 1.000.000), limit=20 (1–100), sort=createdAt|updatedAt,
order=asc|desc (padrão updatedAt desc, desempate id asc), q até 200 (substring
literal case-insensitive em título/descrição/descrições dos segmentos), tag exata
normalizada, projectId UUID, withoutProject=true e includeArchived=true. Sem
includeArchived, arquivadas são excluídas; projectId e withoutProject=true juntos
retornam 400. Todos os filtros por AND; projeto externo/inexistente resulta em
lista vazia. Parâmetros desconhecidos/repetidos são rejeitados. Offset não é snapshot.

Segment tem id,decupageId,position,startMs,endMs,description,createdAt,updatedAt.
Timecodes são offsets relativos à mídia em milissegundos inteiros 0–2.147.483.647
(aproximadamente 24,85 dias), nunca datas/horas. startMs obrigatório e endMs
opcional/null >= startMs; igualdade permitida. Sobreposição e ordem diferente
da cronologia são permitidas. Descrição textual até 10.000, padrão vazio.
POST `{"startMs":1000,"endMs":5000,"description":"Abertura"}` adiciona ao final.
PATCH exige ao menos um campo editável; valida o par final, endMs=null limpa.
position é gerenciada pelo servidor (0..n-1), sem lacunas após remoção.
Reorder recebe `{"segmentIds":["uuid-b","uuid-a"]}`: permutação exata, sem
IDs ausentes/duplicados/externos. [] somente se não houver segmentos. Retorna 400
para conjunto inválido sem mudanças parciais. Cada operação retorna a lista inteira,
limitada a 100 segmentos por decupagem (409 SEGMENT_LIMIT na tentativa de exceder).
Alterações de segmentos atualizam updatedAt da decupagem.

Todas as rotas exigem sessão; todas as mutações exigem Origin confiável e
X-CSRF-Token; CORS habilita credenciais e DELETE. Decupagem/projeto/segmento de outro
proprietário nunca são expostos; 404 indistinguível do inexistente. Outros erros:
400 validação/JSON; 401 sessão; 403 CORS/CSRF; 413 >100 KiB; 415 POST/PATCH sem
application/json; 500 interno. Envelope padrão com details vazio. Reordenação,
adição, edição e remoção são transacionais, com bloqueio do pai por proprietário;
falha reverte toda a operação. Concorrência que muda o conjunto exige recarregar a
lista antes de repetir reorder. UUID de segmento deve pertencer à decupagem da URL.

Não há Event no schema atual; eventId é rejeitado como campo desconhecido e será
adicionado com FK/ownership em tarefa futura. Sem upload, player, análise automática
ou armazenamento de vídeo. Texto deve ser renderizado como texto pelo frontend.
Contrato completo e exemplos no OpenAPI.

## Tarefas e subtarefas — TASK-BE-007

| Método | Rota | Resposta |
|---|---|---|
| GET | `/tasks` | 200 `{items: Task[], page: {number,limit,hasMore}}` |
| POST | `/tasks` | 201 Task e Location |
| GET | `/tasks/:id` | 200 Task com subtasks ordenadas |
| PATCH | `/tasks/:id` | 200 Task |
| POST | `/tasks/:id/complete` | 200 Task |
| POST | `/tasks/:id/reopen` | 200 Task |
| POST | `/tasks/:id/archive` | 200 Task |
| POST | `/tasks/:id/restore` | 200 Task |
| POST | `/tasks/:id/subtasks` | 201 `{items: Subtask[]}` |
| PATCH | `/tasks/:id/subtasks/:subtaskId` | 200 `{items: Subtask[]}` |
| POST | `/tasks/:id/subtasks/:subtaskId/complete` | 200 `{items: Subtask[]}` |
| POST | `/tasks/:id/subtasks/:subtaskId/reopen` | 200 `{items: Subtask[]}` |
| DELETE | `/tasks/:id/subtasks/:subtaskId` | 200 `{items: Subtask[]}` |
| PATCH | `/tasks/:id/subtasks/reorder` | 200 `{items: Subtask[]}` |

Task contém id,title,description,status,priority,startDate,dueDate,completedAt,
projectId,ownerId,createdAt,updatedAt,archivedAt. Criação mínima `{"title":"Editar
vídeo"}` (título trim 1–200, descrição opcional/null até 50.000). Defaults:
PENDING, MEDIUM, datas/vínculo nulos. Projeto opcional deve ser próprio, inclusive
arquivado. PATCH parcial, ao menos um campo; ausência preserva e null limpa
description/startDate/dueDate/projectId. ownerId vem somente da sessão; completedAt
e archivedAt não são editáveis. Campos desconhecidos são rejeitados.

Status usam a convenção dos documentos: PENDING, IN_PROGRESS, COMPLETED, CANCELLED.
PENDING/IN_PROGRESS podem mudar para qualquer um desses estados. COMPLETED e
CANCELLED só podem permanecer iguais ou voltar a PENDING; outras mudanças retornam
409 INVALID_TRANSITION (reabra antes). complete define COMPLETED; repetição preserva
completedAt. Criar COMPLETED também registra o instante. Reopen define PENDING e
limpa completedAt. Qualquer estado diferente de COMPLETED tem completedAt=null.
Conclusão é independente do checklist; nunca conclui/reabre subtarefas em cascata.
Prioridades: LOW < MEDIUM < HIGH < URGENT, padrão MEDIUM.

startDate/dueDate são **datas civis** YYYY-MM-DD (anos 0001–9999), sem horário nem
conversão de fuso; dueDate >= startDate quando ambas preenchidas, validado após o
merge na transação. Timestamps de auditoria/conclusão são instantes UTC ISO 8601.
Precisão de prazo com horário (dueAt) fica para extensão futura; não enviar datetime
em dueDate. Não há recorrência, notificações, eventos ou calendário neste ticket.

Listagem: page=1 (1–1.000.000), limit=20 (1–100), q substring literal case-insensitive
do título (trim, até 200); status, priority, projectId; withoutProject=true;
dueFrom/dueTo inclusivos, YYYY-MM-DD, intervalo ordenado; withoutDueDate=true;
overdue=true; includeArchived=true. Filtros se combinam por AND; projeto externo ou
inexistente resulta em lista vazia. withoutProject conflita com projectId;
withoutDueDate conflita com dueFrom/dueTo/overdue=true: 400. Parâmetros desconhecidos,
repetidos, inválidos ou intervalos invertidos retornam 400.

Atrasada = PENDING/IN_PROGRESS com dueDate anterior ao dia de hoje no fuso das
preferências do usuário autenticado (padrão America/Bahia). Sem prazo, concluídas,
canceladas e vencendo hoje nunca contam como atrasadas. overdue=false não restringe
por atraso. Arquivadas são excluídas por padrão; includeArchived permite incluí-las.
Sort createdAt|updatedAt|priority|dueDate, order asc|desc, padrão updatedAt desc;
desempate por id asc. Ordenação de prazo mantém null no final nas duas direções.
Offset não é snapshot. Exemplo: `/tasks?overdue=true&priority=HIGH&sort=dueDate&order=asc`.

Subtask contém id,taskId,title,completed,position,createdAt,updatedAt. POST exige
title e aceita completed opcional (false). PATCH aceita title/completed (ao menos
um). Complete/reopen definem o booleano, sem mudar status/completedAt do pai.
Adição ao final; position gerenciada pelo servidor 0..n-1, no máximo 100 subtarefas
(409 SUBTASK_LIMIT ao exceder). DELETE remove somente a selecionada, preservando as
demais e compactando posições. Reorder `{"subtaskIds":["uuid-b","uuid-a"]}` exige
permutação completa sem repetição/IDs externos; [] apenas se vazia. Falha não
persiste mudanças parciais; adição/remoção concorrente pode exigir recarregar.
Cada operação retorna a lista inteira ordenada; atualiza updatedAt do pai.
Subtarefas podem ser editadas mesmo em tarefa concluída/arquivada.

Complete/reopen/archive/restore e as ações equivalentes de subtarefa aceitam sem
corpo ou {}. Arquivar preserva status/completedAt/subtarefas e archivedAt original
em repetições; restaurar limpa archivedAt. Sem exclusão definitiva de tarefa.
Sessão em todas as rotas; Origin confiável e X-CSRF-Token em todas as mutações.
CORS com credenciais/DELETE; Cache-Control no-store. Projeto/tarefa/subtarefa
externos não vazam existência: 404 idêntico ao ausente. Outros erros: 400 validação,
401 sessão, 403 CORS/CSRF, 409 transição/limite, 413 corpo >100 KiB, 415 mídia de
POST/PATCH sem JSON, 500 falha interna. Envelope padrão, details vazio, sem refletir
conteúdo privado. Schemas, exemplos e respostas no OpenAPI.

## Recorrência de tarefas — TASK-BE-008

| Método | Rota | Resposta |
|---|---|---|
| POST | `/tasks/:id/recurrence` | 201 regra configurada |
| GET | `/tasks/:id/recurrence` | 200 regra atual + nextOccurrenceDate/taskArchived |
| PATCH | `/tasks/:id/recurrence` | 200 nova versão da regra |
| POST | `/tasks/:id/recurrence/suspend` | 200 regra PAUSED |
| POST | `/tasks/:id/recurrence/resume` | 200 regra ACTIVE |
| POST | `/tasks/:id/recurrence/end` | 200 regra ENDED |
| GET | `/tasks/:id/occurrences` | 200 itens e cursor |
| POST | `/tasks/:id/occurrences/:ruleId/:date/complete` | 200 estado individual |
| POST | `/tasks/:id/occurrences/:ruleId/:date/reopen` | 200 estado individual |

Crie uma tarefa com POST /tasks e configure a regra pelo POST acima. Não há cópias
de tarefas nem criação antecipada de ocorrências. Exemplo de configuração:
`{"frequency":"WEEKLY","startDate":"2026-11-01","interval":1,"weekdays":[1,5],"timezone":"America/Bahia","count":20}`.
Obrigatórios: frequency/startDate/timezone IANA (UTC aceito). frequency:
DAILY/WEEKLY/MONTHLY/CUSTOM_DAYS; interval inteiro 1–365, padrão 1, em dias/semanas/
meses respectivamente. weekdays ISO segunda=1/domingo=7, únicos; não vazio só em
WEEKLY, vazio nas demais. endDate opcional/null inclusiva >= startDate; count
opcional/null 1–10.000, contado desde a primeira ocorrência (não da janela).
PATCH parcial exige ao menos um campo; valida merge e cria nova versão/UUID,
preservando histórico anterior. Campos ausentes preservados, count/endDate null
removem limites. Mudar frequência pode exigir weekdays=[] no mesmo PATCH.
Máximo 100 versões por tarefa; POST repetido retorna 409.

Datas são civis YYYY-MM-DD, anos 0001–9999, sem horário específico. timezone
define hoje para nextOccurrenceDate, sem converter datas em instantes artificiais.
DST não cria horários inexistentes/ambíguos porque não há hora nesta versão.
Semanal ancora semanas na segunda-feira da semana inicial e omite dias anteriores
a startDate. Mensal ancora o dia original, reduz ao último dia dos meses curtos e
restaura o dia original nos seguintes (31/jan → 28/fev → 31/mar; bissexto 29/fev).
Limites operacionais mesmo sem término: até 10.000 ocorrências e horizonte de 100
anos da âncora (sem ultrapassar ano 9999), sem geração infinita.

GET occurrences exige from/to inclusivos (diferença máxima 365 dias, 366 datas),
limit 1–100 (padrão 100), after opcional exclusivo dentro da janela e ruleId opcional
(padrão atual). Retorno `{items:[{ruleId,date,completedAt}],page:{limit,nextAfter},
calculated}`; envie nextAfter como after mantendo filtros. Datas em ordem crescente.
Leituras não gravam nada. Somente versão atual ACTIVE e tarefa não arquivada
calculam datas; demais casos retornam só estados já persistidos (calculated=false).
Versões anteriores são consultáveis com ruleId e permanecem somente leitura.
nextOccurrenceDate é a primeira data não concluída >= hoje no fuso da regra, ou
null se exaurida/inativa/arquivada; não é persistida, para não ficar obsoleta.

Complete/reopen materializam só a chave (ruleId,date), preservam tarefa/subtarefas
e demais datas. Complete repetido preserva completedAt e não duplica histórico;
reopen limpa e registra mudança real. Datas futuras válidas podem ser concluídas.
O log de transições é persistido para auditoria, sem endpoint de log nesta tarefa.
Suspensão não desloca âncora/count; resume retoma o calendário original (inclusive
passado consultável), sem criar backfill no banco. ENDED é terminal, só end pode
ser repetido; não permite PATCH/resume. Ações aceitam sem corpo ou {}.

Arquivar a tarefa esconde cálculo/próxima ocorrência e bloqueia todas as mutações
de recorrência/ocorrência (409), preservando regra/histórico. Restaurar a tarefa
reabilita o estado anterior, sem reativar PAUSED/ENDED. Concluir/reabrir a tarefa
principal pelo endpoint antigo não conclui/reabre ocorrências nem muda a regra;
use os endpoints individuais para trabalho recorrente. Tarefas comuns não mudam.

Sessão obrigatória, ownership verificado no pai; Origin/CSRF em mutações. 404
indistinguível para tarefas/regras externas ou ausentes e datas fora do calendário;
400 DTO/janela/cursor; 401 sessão; 403 CORS/CSRF; 409 RECURRENCE_CONFLICT ou
RECURRENCE_LIMIT; 413 limite de corpo; 415 JSON exigido em configuração/edição;
500 genérico. Queries desconhecidas/repetidas são rejeitadas. Transações bloqueiam
o pai antes de ler regra/estado, serializando edição/completion/arquivo. Sem Cron,
Queues, notificações, eventos ou calendário visual. OpenAPI contém todos os DTOs.

## Eventos e séries — TASK-BE-009

| Método | Rota | Resposta |
|---|---|---|
| GET/POST | `/events` | 200 página / 201 Event + Location |
| GET/PATCH | `/events/:id` | 200 EventDetail / Event |
| POST | `/events/:id/archive` e `/restore` | 200 Event |
| GET/POST/PATCH | `/events/:id/recurrence` | 200 regra / 201 regra / 200 nova versão |
| POST | `/events/:id/recurrence/suspend`, `/resume`, `/end` | 200 regra |
| GET | `/events/:id/occurrences` | 200 página de ocorrências |
| PATCH | `/events/:id/occurrences/:ruleId/:date` | 200 ocorrência alterada |
| POST | `/events/:id/occurrences/:ruleId/:date/cancel` e `/restore` | 200 ocorrência |

Event: id,title,description,startAt,endAt,timezone,location,projectId,ownerId,
createdAt,updatedAt,archivedAt. GET individual adiciona recurrence atual ou null.
POST exige title trim 1–200, startAt/endAt ISO 8601 com Z/offset e timezone IANA;
description opcional/null até 50.000, location opcional/null até 1.000 e projeto
opcional próprio (inclusive arquivado). Instantes são normalizados UTC, precisão
máxima de milissegundos, anos UTC 0001–9999. endAt > startAt, duração máxima
31*24h. PATCH valida o par final; ausência preserva e null limpa opcionais.
Sem exclusão definitiva, sem conversão automática de tarefas em eventos.

GET /events usa page=1 (até 1.000.000), limit=20 (1–100), q substring literal de
título case-insensitive/trim até 200, projectId, from/to instantes opcionais,
sort=startAt|endAt|createdAt|updatedAt, order=asc|desc (padrão startAt asc, id asc
no desempate), includeArchived=false. Campos desconhecidos/repetidos rejeitados.
Janela semiaberta [from,to): endAt > from e startAt < to. Inclui eventos que começam
antes e terminam dentro ou atravessam ambos os limites; não inclui os que terminam
exatamente em from ou começam exatamente em to. Ambos preenchidos exigem to>from.
Projeto externo/inexistente resulta em lista vazia. Listagem considera o registro
**mestre/semente**, não expande séries nem mistura tarefas; use occurrences por
série para datas virtuais. Offset não é snapshot concorrente.

Crie um evento mestre e configure recurrence com o mesmo DTO das tarefas:
frequency DAILY/WEEKLY/MONTHLY/CUSTOM_DAYS, interval 1–365, startDate civil,
weekdays ISO (segunda=1, só WEEKLY exige lista não vazia), endDate inclusiva opcional,
count opcional até 10.000, timezone IANA. O horário local de anchorStartAt (copiado
do início do mestre) é repetido no timezone da regra; duração é anchorEndAt menos
anchorStartAt em milissegundos, mantida fixa (o horário local de término pode mudar
quando uma ocorrência atravessa DST). startDate pode ser independente da data da
semente; ela define a primeira data elegível, não cria um segundo evento mestre.
Mensal preserva a política clamp da TASK-BE-008 (31/jan → 28/fev → 31/mar).
Semanal usa semanas ISO de segunda. Não há geração antecipada de registros.

DST: horário local inexistente é omitido; em horário duplicado escolhe-se o primeiro
instante. Omitidos ainda consomem slots de count do calendário civil, não geram
reposições. Suporta mudanças de 30 minutos (ex.: Lord Howe), sem presumir offsets
inteiros em horas. Recorrência sem hora das tarefas permanece inalterada.

PATCH recurrence cria novo UUID/versão, preserva estado PAUSED e não transfere
exceções antigas. Além dos campos de regra, aceita anchorStartAt/anchorEndAt para
mudar hora local/duração; timezone também editável. Com regra configurada, PATCH
no mestre não altera startAt/endAt/timezone (409): use a regra para mudar os tempos
da série. O mestre mantém sua semente original; GET regra mostra a âncora atual.
Metadados title/description/location do mestre são herdados por ocorrências sem
exceção; exceções materializadas preservam seu snapshot textual e temporal.
Máximo 100 versões; versões anteriores são consultáveis somente para exceções
salvas com ruleId e ficam somente leitura. ENDED é terminal, sem PATCH/resume.

GET occurrences exige from/to instantes com to>from, janela até 366*24h, page/limit
como a listagem e ruleId opcional (padrão atual). Retorna `{items:[{ruleId,date,title,
description,location,startAt,endAt,cancelled,updatedAt}],page:{number,limit,hasMore},
calculated}`. Ordena por startAt e data original asc. Usa overlap [from,to) após
aplicar exceções: remove movidas para fora e inclui movidas para dentro mesmo que
a data original esteja longe da janela. Canceladas continuam visíveis com flag
cancelled=true. Sem regra retorna 404 (evento único consultável via GET mestre).
Limites compartilhados: 10.000 slots, 100 anos de horizonte/ano 9999 e 100 versões.
Duração máxima de 31 dias limita a busca retroativa de ocorrências que atravessam
a janela. Leituras não gravam nada e a chave (ruleId,date original) é estável.

PATCH ocorrência altera só title/description/location/startAt/endAt; mantém sua
identidade original mesmo se mover para outra data. Valida o par final. Cancela/
restaura com POST sem corpo ou {}, idempotente quanto ao booleano. Restaurar mantém
edições anteriores, e editar não restaura automaticamente uma cancelada. Sem
alterações nos irmãos, na regra ou na semente. Datas omitidas por gap DST são 404.

Suspensão/encerramento/arquivo mantêm somente exceções já persistidas observáveis
(calculated=false), sem calcular novos compromissos. Resume retoma calendário e
âncora originais, sem materialização retroativa. Arquivar bloqueia mutações de
regra/ocorrência (409); restauração do mestre não reativa PAUSED/ENDED. Archive/
restore do mestre preservam exceções e aceitam sem corpo ou {}. Mutações do mestre
metadados/arquivo e de séries/exceções compartilham bloqueio transacional do evento
por proprietário, para validar estado atual antes de persistir. Falhas revertem tudo.

Auth em todos os endpoints; Origin/CSRF em todas as mutações; CORS com credenciais,
Cache-Control no-store. ownerId vem da sessão. 400 validação/JSON/janela, 401 sessão,
403 CORS/CSRF, 404 recurso ausente ou externo indistinguível, 409 EVENT_CONFLICT ou
EVENT_LIMIT, 413 >100 KiB, 415 mídia não JSON em POST/PATCH com payload, 500 genérico.
Contrato detalhado e exemplos no OpenAPI. Sem notificações, sincronização Google,
calendário visual, deploy ou alterações nos contratos de tarefas.
