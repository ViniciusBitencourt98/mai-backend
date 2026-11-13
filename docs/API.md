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
