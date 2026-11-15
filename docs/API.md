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
| GET | `/api/v1/dashboard?date=` | Proposta histórica; contrato implementado em `/dashboard` (BE-014) |
| GET/PATCH | `/api/v1/notification-preferences` | Preferências e horário de resumo |
| GET | `/api/v1/notifications` | Histórico de lembretes/envios |
| GET | `/api/v1/exports/events.ics?from=&to=` | Proposta V2, não implementada; não bloqueia MVP |

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

Em ocorrências calculadas, updatedAt usa o mais recente entre mestre e versão da
regra, refletindo metadados herdados. Exceções materializadas mantêm seu timestamp.

## Calendário agregado — TASK-BE-010 / F3-13

`GET /calendar` exige sessão e retorna projeções mínimas, sem persistência própria.
Query estrita: from/to ISO 8601 com Z/offset, from < to, janela máxima 31*24h;
types opcional com `TASK`, `EVENT`, `PUBLICATION` ou qualquer combinação sem
espaços/repetições (padrão preservado `TASK,EVENT`; publicações exigem seleção explícita);
page=1 (até 10.000), limit=20 (1–100). Parâmetros repetidos/desconhecidos retornam
400. Retorno `{items: CalendarItem[],page:{number,limit,hasMore},timezone}`.

Itens discriminados por type TASK/EVENT/PUBLICATION. Campos comuns: id,masterId,ruleId nullable,
version nullable,occurrenceDate nullable,title,recurring,modified,href,timezone.
Id de ocorrência é ruleId:data original; use type+id como chave no frontend.
href aponta para /tasks/:id ou /events/:id. modified indica estado individual de
tarefa persistido ou exceção de evento; mestres pontuais têm false. TASK adiciona
date YYYY-MM-DD e completed; não atribui hora/endAt artificiais. EVENT adiciona
startAt/endAt UTC. PUBLICATION adiciona scheduledAt UTC, status editorial, platform e
projectId nullable, com href /publications/:id; ruleId/version/occurrenceDate null e
recurring/modified false, sem startAt/endAt/duração artificial. timezone do item é o da regra, do evento único ou da preferência
do usuário para tarefa única/publicação; timezone externo é a preferência do usuário.

Eventos usam overlap semiaberto [from,to), incluindo compromissos atravessando
limites. Tarefas civis entram se seu dia intersecta a janela no fuso correspondente
(localToday(from) até localToday(to-1ms)). Tarefas pontuais sem dueDate são omitidas;
startDate isolada não vira compromisso. Concluídas aparecem com completed=true,
canceladas e arquivadas são omitidas. Mestres recorrentes não aparecem novamente
como itens pontuais. Conclusão do mestre não se propaga às ocorrências.

Expansão delegada a RecurrenceService/EventService, sem terceiro motor. Somente a
versão atual participa. Séries pausadas/encerradas mantêm apenas estados/exceções
já persistidos conforme BE-008/009; eventos cancelled=true são omitidos. Exceções
movidas substituem a data original e entram/saem pelo intervalo final. As políticas
existentes de DST, clamp mensal e limites de geração permanecem inalteradas.

Ordenação determinística lexicográfica da data civil (TASK) ou instante UTC (EVENT),
ou scheduledAt UTC (PUBLICATION), seguida de type e id; tarefas sem hora ficam no início da sua data, sem criar um
instante UTC fictício. A paginação é offset após agregação; mudanças concorrentes
podem deslocar páginas. Não há snapshot global entre serviços, e ruleId é fixado na
expansão para impedir misturar versões durante edição concorrente.

Limites: 100 mestres/registros selecionados por tipo e 10.000 itens no orçamento
de expansão/agregação (incluindo ocorrências canceladas antes da filtragem e
publicações). Excesso
retorna 409 CALENDAR_LIMIT, sem resposta parcial. Séries não arquivadas contam no
limite mesmo se não gerarem itens na janela. Use types/janela menor ou endpoints
de domínio para conjuntos maiores. Limites próprios dos serviços continuam válidos.
401 sem sessão, 400 query, 409 limites, 500 interno/503 serviço não configurado;
403 CORS se Origin proibida. Cache-Control no-store, CORS com credenciais. Sem
migrations/schema novos, dashboard, ICS, UI ou notificações. Publicações foram
adicionadas no recorte BE-013 descrito abaixo.


## Publicações editoriais — TASK-BE-012

Contrato implementado em `/publications` (sem `/api/v1` e sem DELETE); substitui
o esboço editorial do catálogo inicial. [OpenAPI](openapi.json) detalha os DTOs,
exemplos, enums, filtros, paginação, autenticação/CSRF e erros.

| Método | Rota | Resposta |
|---|---|---|
| GET/POST | `/publications` | 200 PublicationPage / 201 Publication + Location |
| GET/PATCH | `/publications/:id` | 200 Publication |
| POST | `/publications/:id/archive` e `/restore` | 200 Publication |

POST exige title (trim, 1–200), platform e format. Plataformas: INSTAGRAM, TIKTOK,
YOUTUBE, FACEBOOK, LINKEDIN, OTHER. Formatos: SHORT_VIDEO, LONG_VIDEO, REELS, STORIES,
CAROUSEL, IMAGE, TEXT, OTHER, sem matriz de combinações. Status padrão IDEA; aceita
PLANNED, IN_PRODUCTION, READY, PUBLISHED, CANCELLED. Transições manuais livres,
sem aprovação/postagem externa; scheduledAt não agenda em rede. Ver ADR-004.

caption/notes opcionais nullable (até 50.000), externalUrl opcional nullable HTTP(S)
até 2.000; projectId opcional/null próprio, inclusive projeto arquivado. scheduledAt
e publishedAt são instantes opcionais/null, ISO com Z/offset, até milissegundos,
anos UTC 0001–9999, resposta UTC. Não há regra obrigando publishedAt em PUBLISHED;
nenhuma edição/status gera ou limpa essa data automaticamente. Ausência em PATCH
preserva; null remove opcionais. IDs/ownerId/auditoria são somente leitura e
rejeitados em entradas. Retorno inclui todos os campos e nulls, além de id,ownerId,
createdAt,updatedAt,archivedAt. Projeto pode ser removido sem perda dos demais dados.

GET lista page=1 (até 1.000.000), limit=20 (1–100), q substring literal de título
case-insensitive com trim até 200, platform,format,status,projectId,from,to,
includeArchived=false,sort=scheduledAt|updatedAt,order=asc|desc (padrão scheduledAt
asc, nulls sempre no fim, UUID asc no desempate). Intervalo planejado [from,to),
from inclusivo/to exclusivo e from < to quando ambos presentes; um limite sozinho
é aceito, registros sem scheduledAt ficam fora de qualquer intervalo. Filtros AND;
projeto externo/inexistente retorna lista vazia. Query estrita rejeita parâmetros
repetidos/desconhecidos. Retorno `{items:Publication[],page:{number,limit,hasMore}}`;
no máximo limit itens. Offset não garante snapshot entre páginas concorrentes.

Arquivo/restauração sem corpo ou {} são idempotentes e preservam status, datas e
vínculos. Arquivadas consultáveis/editáveis, omitidas da lista por padrão. Sem
exclusão definitiva, conversão em evento, postagem social ou modificação de /calendar.

Sessão em todos os endpoints; Origin confiável e X-CSRF-Token em todas as mutações.
CORS com credenciais, Cache-Control no-store e X-Request-Id. Erros padronizados:
400 VALIDATION_ERROR/INVALID_JSON, 401 UNAUTHENTICATED, 403 CORS/CSRF, 404 NOT_FOUND
para publicação/projeto ausente ou externo, 413 corpo >100 KiB, 415 exige JSON
em POST/PATCH, 500 INTERNAL_ERROR sanitizado, 503 serviço não configurado.


### Publicações no calendário — TASK-BE-013

`GET /calendar?from=2026-11-20T00:00:00Z&to=2026-11-21T00:00:00Z&types=PUBLICATION`
retorna publicações próprias com scheduledAt na janela semiaberta [from,to),
não arquivadas e status diferente de CANCELLED. Sem scheduledAt ficam fora, mesmo
com publishedAt preenchido. Demais estados datados, inclusive PUBLISHED, aparecem;
nenhuma leitura muda estado/data ou cria evento. scheduledAt usa precisão de
milissegundos em UTC, com apresentação no fuso da sessão. Não há hora de término.

A projeção inclui somente identidade/origem comum, title, scheduledAt, status,
platform e projectId opcional. Não expõe caption, notes, externalUrl, publishedAt
ou ownerId. O ID é o UUID original, masterId igual a id, href /publications/:id;
a chave para o consumidor continua type+id. Formato/auditoria estão no CRUD original.

PUBLICATION pode ser usado sozinho ou com TASK/EVENT, em qualquer ordem. Sem types,
o padrão continua TASK,EVENT para preservar clientes BE-010/FE-013/014. Opt-in de
todos: `types=TASK,EVENT,PUBLICATION`. Query repetida, tipos repetidos/desconhecidos,
espaços, ownerId do cliente ou janela inválida retornam 400. Nenhuma mudança nos
DTOs dos itens TASK/EVENT nem nas regras de suas recorrências.

A consulta Prisma filtra ownerId da sessão, archivedAt/status e scheduledAt gte/lt
no banco. Seleciona só seis campos e até 101 registros (sentinela), com predicados compatíveis com os índices
existentes owner_id/archived_at/scheduled_at e owner_id/scheduled_at (plano real
EXPLAIN permanece pendente). Mais de 100
publicações na janela retorna 409 CALENDAR_LIMIT, mesmo com limit=1; nunca entrega
página parcial silenciosa. Não carrega todas as publicações para filtrar em memória.
O orçamento global também conta cada publicação além das expansões já existentes.
Ordenação usa data/instante lexicográfico, depois type e id asc; paginação única
após agregação. Offset permanece sem snapshot concorrente entre requisições.

Autenticação, CORS com credenciais, Cache-Control no-store e erros 400/401/403/409/
500/503 preservados. Sem nova tabela, migration ou endpoint, sem dependência de
publicação automática, dashboard, notificações, ICS ou Google Calendar. Contrato e
exemplo em CalendarPublication/CalendarPage no OpenAPI; persistência Neon real
permanece pendente, não demonstrada pelos mocks dos testes isolados.

## Dashboard operacional — TASK-BE-014 / F4-05

`GET /dashboard` é a única rota implementada do resumo (não `/api/v1/dashboard`).
Exige sessão, obtém proprietário/fuso IANA exclusivamente dela e retorna JSON com
Cache-Control no-store, X-Request-Id e CORS com credenciais. Não há mutações, tabelas
ou migrations próprias, analytics, e-mail ou alterações de contrato de `/calendar`.

Query estrita: `date` opcional YYYY-MM-DD, padrão dia local no instante da requisição;
`limit` inteiro textual 1–20, padrão 10, aplicado a cada lista. Rejeita campos
extras/repetidos, inclusive ownerId/timezone/page. Data civil inexistente no fuso
(ex.: dia suprimido por mudança de calendário) ou janela que extrapole anos
0001–9999 retorna 400. Instantes UTC das janelas são calculados por limites civis,
sem somar 24h: dias de DST podem durar 23/25h e meia-noite inexistente usa o primeiro
instante válido. O fuso de apresentação não é presumido UTC.

Resposta `Dashboard`: date,timezone,limit,windows,counts,today,overdueTasks,
upcomingTasks,upcomingEvents,upcomingPublications. Cada lista é `{items,hasMore}`,
com no máximo limit itens. Não há paginação do resumo; hasMore orienta consultar
endpoints de domínio/calendário para explorar mais. Itens reutilizam integralmente
CalendarTask/CalendarEvent/CalendarPublication e href/identidade type+id.

| Seção | Semântica |
|---|---|
| windows.today / today | Dia civil selecionado [início,início do próximo dia). Tarefas civis cujo dia intersecta a janela no fuso do item, inclusive concluídas; eventos/ocorrências sobrepostos, inclusive atravessando meia-noite; publicações com scheduledAt na janela, inclusive PUBLISHED |
| windows.overdue / overdueTasks | 30 dias civis anteriores, não todo o histórico. Só tarefas/ocorrências incompletas com data anterior ao primeiro dia de hoje no fuso do item e ausentes de today. Não usa ocorrências futuras como atraso |
| windows.upcoming / upcomingTasks | Sete dias civis após o selecionado, sem tarefas concluídas nem itens já presentes em today |
| upcomingEvents | Eventos/ocorrências nos próximos sete dias, excluindo os já exibidos em today; cancelamentos/movimentos tratados pelo motor existente |
| upcomingPublications | Próximos sete dias; scheduledAt, nunca publishedAt; sem arquivadas/CANCELLED/PUBLISHED |

Arquivo/cancelamento seguem o calendário; tarefa mestre recorrente não é
retornada como tarefa pontual adicional. Estados individuais e exceções são
calculados pelos serviços reais existentes. Séries PAUSED/ENDED seguem a política
já existente de mostrar apenas estados/exceções salvos. Uma tarefa civil pode
intersectar duas janelas UTC; a identidade exibida em today é retirada das listas
laterais para não duplicar. Ordem determinística herdada: data civil/instante UTC,
type e id asc. Eventos com duração não são transformados em tarefas; publicações
são pontos sem duração fictícia. Edição de status não é efeito desta leitura.

| Contador | Unidade e alcance (antes de limitar listas) |
|---|---|
| pendingTasks | Agregado PostgreSQL global por tarefa principal própria não arquivada PENDING/IN_PROGRESS; inclui sem prazo e cada mestre recorrente uma vez, mesmo com regra pausada/encerrada. Não soma ocorrências; não depende do dia consultado |
| overdueTasks | Tarefas/ocorrências incompletas na janela de atraso de 30 dias, após excluir today. Não é total histórico global de atrasos |
| todayActivities | Todos os itens em today, inclusive tarefas concluídas e publicações PUBLISHED |
| plannedPublications | Publicações diferentes de PUBLISHED entre início do dia selecionado e fim dos sete dias seguintes; não é contagem global |

Performance: duas coletas limitadas e disjuntas em uma execução do escopo de
calendário: TASK nos 30 dias passados, todos os tipos em hoje+sete dias seguintes.
`CalendarService.collect` contém a agregação existente; `/calendar` continua
paginando o mesmo resultado. Não recalcular agregação para cada lista ou página.
Cada coleta herda até 100 mestres/registros por tipo e orçamento 10.000 de expansão
(inclusive ocorrências canceladas antes de ocultar). Somadas, no máximo 10.000
projeções visíveis podem ser processadas pelo dashboard; excesso gera erro, não
resposta parcial. A contagem global usa COUNT no banco, sem carregar todas as
linhas. Plano SQL/custos reais ainda dependem de validação Neon. Não há snapshot
transacional global entre count, coletas e scopes de recorrência; mudanças
concorrentes podem afetar a consistência temporal do resumo.

Erros no envelope padrão: 400 VALIDATION_ERROR; 401 UNAUTHENTICATED; 403 CORS;
409 DASHBOARD_LIMIT/CALENDAR_LIMIT ou limites dos motores delegados; 500 genérico;
503 serviço não configurado. Dados/contagens não são substituídos por zeros em
falha. Em limites, consultar os endpoints de domínio com janelas menores.
Contrato e exemplo completos em Dashboard/DashboardCounts no OpenAPI. Testes são
isolados; Express/Workers → Prisma → Neon permanece pendente.

## Perfil e preferências essenciais — TASK-BE-015 / F1-08

| Método | Caminho | Resposta |
|---|---|---|
| GET | `/me/preferences` | 200 UserPreferences |
| PATCH | `/me/preferences` | 200 UserPreferences atualizadas |

Novo contrato de edição, sem duplicar ou alterar `/auth/me`. Resposta plana com
`{name,timezone,emailEnabled,dailyDigestEnabled,dailyDigestTime}`; não inclui ID,
e-mail, senha/hash ou token. Proprietário vem exclusivamente da sessão; sem ID na
rota/corpo/query. GET e PATCH rejeitam qualquer query não vazia. Autenticação nos
dois; PATCH exige Origin confiável, X-CSRF-Token e application/json. CORS com
credenciais, Cache-Control no-store, X-Request-Id; preflight GET/HEAD/PATCH/OPTIONS.

| Campo | Validação / padrão |
|---|---|
| name | User.name existente, trim, 1–100; mantém nome atual quando omitido |
| timezone | Fuso reconhecido por Intl/IANA, até 100 caracteres, aceita UTC/aliases do runtime e rejeita offsets +/-; padrão America/Bahia |
| emailEnabled | Booleano estrito; padrão false; preferência mestre para futuros e-mails |
| dailyDigestEnabled | Booleano estrito; padrão false; opt-in do resumo futuro |
| dailyDigestTime | HH:mm local de 00:00 a 23:59, exatamente cinco caracteres, sem segundos/offset; padrão 08:00 |

PATCH parcial estrito exige pelo menos um campo. Ausência preserva; null é inválido
para todos os campos. Não aceita coerção de string/number em booleanos nem campos
de autenticação (e-mail, senha, disabledAt) ou userId/ownerId. Hora/fuso podem ser
configurados com e-mail/resumo desativados. As duas flags são independentes:
desativar e-mail não apaga opt-in/horário do resumo; um futuro envio de resumo
precisará de emailEnabled **e** dailyDigestEnabled true. Não há envio ou job nesta
API; políticas de disparo em horários locais inexistentes/ambíguos por DST serão
tratadas no módulo de notificações, não por transformação deste horário em UTC.

GET usa defaults se a relação UserPreferences ainda estiver ausente, sem gravar.
PATCH faz upsert dessa relação, com defaults do banco para campos não fornecidos,
e atualiza User.name na mesma transação. Revalida conta ativa e bloqueia sua linha
antes de upsert; atualizações concorrentes enviam somente os campos fornecidos,
evita sobrescrever campos omitidos. User.updatedAt registra alterações inclusive
só de preferências. Conta removida/desativada retorna 401; falha intermediária
propaga erro e o banco deve reverter a transação (validação real ainda pendente).

`/auth/me` preserva a projeção antiga `user.name` e
`user.preferences:{timezone,emailEnabled}`, sem adicionar os campos de resumo à
sessão. O repository de autenticação lê preferências a cada requisição; próximas
requisições autenticadas de calendário/dashboard/tarefas já recebem o novo fuso,
sem re-login ou rotação de cookie/CSRF. O futuro frontend deve atualizar seu cache
de sessão consultando `/auth/me` após PATCH e invalidar visões dependentes de fuso.
Resumo/horário completos são consultados neste novo endpoint pelos consumidores.

Mudar fuso não reescreve datas civis, instantes UTC de eventos/publicações nem
fusos de regras de recorrência existentes. Não altera dados históricos, credenciais,
sessões ou estado de notificações. Migration aditiva
`20261115000100_user_preferences` apenas versionada, não aplicada, adiciona dois
campos com defaults e CHECK de HH:mm. Sem novas tabelas/índices ou duplicação de nome.

Erros no envelope padrão: 400 VALIDATION_ERROR/INVALID_JSON, 401 UNAUTHENTICATED,
403 CORS/CSRF, 413 corpo >100 KiB, 415 mídia não JSON, 500 sanitizado e 503 serviço
não configurado. Contrato UserPreferences/PatchUserPreferences e exemplos no
OpenAPI. Integração Neon, concorrência/rollback e aplicação da migration seguem
pendentes; não há envio de e-mail, Cron/Queues, frontend, ICS ou Google Calendar.

## Fundação interna de notificações — TASK-BE-016

Nenhum endpoint de notificação/outbox foi criado. NotificationService e scope/
repositories são internos para futuros produtores/processadores autorizados;
não adicionar rotas públicas para dados técnicos, leases ou confirmações de envio.
O contrato HTTP/OpenAPI existente permanece inalterado. Interfaces, estados,
DTOs internos e limites estão em [NOTIFICATIONS-OUTBOX](NOTIFICATIONS-OUTBOX.md).
