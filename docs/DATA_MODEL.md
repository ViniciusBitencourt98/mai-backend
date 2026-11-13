# Modelo de dados lógico — proposta a validar em migration

Este documento guia modelagem e relacionamentos; **não é um schema Prisma pronto**. Nomes físicos em `snake_case`, DTO em `camelCase`, salvo convenção definida no bootstrap. Toda entidade de negócio tem `id`, `user_id`, `created_at`, `updated_at` quando aplicável.

| Entidade | Campos essenciais | Relações / regras |
|---|---|---|
| `users` | id, email único, nome, timezone, auth reference | Propriedade de registros |
| `user_preferences` | user_id, daily_digest_enabled, digest_time_local, notification_email | Preferências pessoais |
| `projects` | id, user_id, name, description?, status, archived_at? | Agrupador opcional; não deletar filhos em cascata |
| `tasks` | id, user_id, project_id?, title, description?, status, priority, due_date?, due_at?, completed_at?, recurrence_id? | Prazo com ou sem horário; suporte recorrência |
| `task_checklist_items` | id, task_id, label, done, position | Checklist simples |
| `events` | id, user_id, project_id?, title, description?, start_at, end_at, all_day, location?, meeting_url?, recurrence_id? | Data fim maior que início |
| `recurrence_rules` | id, user_id, entity_type, frequency, interval, by_weekday?, until_date?, count?, timezone | Normalizar e proteger contra expansão infinita |
| `recurrence_exceptions` | id, recurrence_id, original_occurrence_key, operation, overridden_start_at?, overridden_end_at?, override_payload? | Cancelamento/movimentação de ocorrência |
| `notes` | id, user_id, title, content?, tags? | Nota livre, independente |
| `note_links` | id, user_id, note_id, project_id?, event_id? | Vínculos opcionais, validar dono; exclusividade/duplo vínculo definida por check |
| `decoupages` | id, user_id, title, content?, media_url?, tags? | Não exige projeto/evento |
| `decoupage_segments` | id, decoupage_id, start_ms?, end_ms?, description, observations?, position | Timecodes relativos à mídia |
| `decoupage_links` | id, user_id, decoupage_id, project_id?, event_id? | Vínculos opcionais |
| `publications` | id, user_id, project_id?, title, description?, platform, format?, scheduled_at?, status, caption?, material_url? | Status manual; não envia para redes |
| `notification_preferences` | user_id, email_enabled, etc. | Ou fundir com `user_preferences` |
| `reminder_rules` | id, user_id, source_type, source_id, offset_minutes?, scheduled_at?, enabled | Regra de intenção; impedir alvos de outros usuários |
| `transaction_outbox` | id, user_id, event_type, source_type, source_id, source_version, payload, status, scheduled_at, published_at?, sent_at?, attempt_count, last_error?, idempotency_key único, lease_until? | Uma linha por intenção de envio; retenção definida |
| `notification_delivery_log` | id, outbox_id, provider, provider_message_id?, status, error_code?, created_at | Observabilidade; não confundir aceite com entrega |

## Propriedade e integridade

- Chaves FK, índices com `user_id` e restrições únicas de negócio. Validar isolamento em **cada** relação opcional.
- Projetos arquivados continuam associados; remoção não é `ON DELETE CASCADE` para anotações/tarefas/eventos.
- Definir se notas e decupagens permitem **um** projeto/evento ou **múltiplos** na fase inicial; proposta de MVP: no máximo um de cada por registro (a validar no ADR).
- `source_type + source_id` representa referência polimórfica: validar via service, pois FK polimórfica não é garantida pelo banco sem estratégia adicional.
- `due_date` (dia civil sem horário) e `due_at` (instante UTC) não precisam estar simultaneamente preenchidos; definir restrição de consistência.
- Para recorrência de tarefas, guardar conclusão por ocorrência (ex.: `task_occurrence_state`) sem expandir infinitamente as instâncias. Definir schema definitivo antes de começar RF-01.4.
- Índices sugeridos: `tasks(user_id,status,due_at)`, `events(user_id,start_at)`, `publications(user_id,scheduled_at)`, `notes(user_id,updated_at)`, `decoupages(user_id,updated_at)`, `transaction_outbox(status,scheduled_at)` e único `idempotency_key`.
- Busca textual PostgreSQL `ILIKE` inicial, índices específicos se necessário; nenhum mecanismo adicional de busca exigido.

## Fluxos e estados

**Tarefa:** `PENDING → IN_PROGRESS → COMPLETED`; `PENDING/IN_PROGRESS → CANCELLED`; possível reabertura mediante regra e invalidação dos lembretes anteriores.

**Publicação:** `IDEA → PLANNED → IN_PRODUCTION → READY → SCHEDULED → PUBLISHED`, com mudanças manuais; sugerir reduzir estados após validação com usuária.

**Outbox:** `PENDING → RESERVED → PUBLISHED → SENT`, ou `FAILED/CANCELLED`; `PUBLISHED` significa fila aceitou, `SENT` significa provedor aceitou. Falha para intervenção manual.

## Regras de exclusão

- Propor soft delete/arquivamento para entidades com vínculos e status. Definir política de retenção e exclusão definitiva no ADR antes da migration.
- Ao apagar evento associado a nota/decupagem, desvincular ou impedir exclusão com confirmação; não remover nota.
- Atualização de tarefa/evento/publicação que invalide lembrete deve cancelar/obsoletar a outbox correspondente de forma transacional.

## Identidade implementada — F1-01 a F1-04

A migration de autenticação implementa somente o subconjunto de identidade:
`users` (UUID, e-mail normalizado único, nome, hash de senha, disabled_at e timestamps),
`user_preferences` (1:1, timezone e email_enabled), `sessions` (hash de token único,
usuária, criação, expiração e revogação) e `auth_throttles` (buckets técnicos de
limite de login). Índices de sessão por usuária/expiração e de throttle por
expiração. O banco também restringe e-mail a minúsculas. Senhas/tokens brutos não
são persistidos; não há entidade de negócio nova. Regras e retenção estão na
[ADR-001](ADR-001-AUTHENTICATION.md). Aplicação das migrations e persistência real
em PostgreSQL continuam pendentes nesta entrega, sem conexão de desenvolvimento.

## Projetos implementados — TASK-BE-004

`Project`/`projects` tem UUID, nome varchar(200), descrição nullable, enum
`ProjectStatus` (`ACTIVE`, `ARCHIVED`), cor char(7) nullable, `start_date` e
`due_date` DATE nullable, `owner_id` UUID, timestamps UTC e `archived_at` nullable.
A FK ao usuário usa RESTRICT; não há exclusão definitiva nem relações obrigatórias
com os módulos futuros. Índices: (owner_id,status,updated_at), (owner_id,updated_at),
(owner_id,name) e (owner_id,created_at). A migration versionada adiciona CHECKs
para a ordem das datas e a equivalência entre ARCHIVED e archived_at preenchido.
Não foi aplicada a nenhum banco nesta tarefa. Remover a tabela/enum em rollback
é destrutivo e requer backup/decisão explícita; não há rollback automático.

## Anotações implementadas — TASK-BE-005

`Note`/`notes`: UUID, title varchar(200), content TEXT não nulo padrão vazio, tags
TEXT[] não nulo padrão vazio, owner_id UUID obrigatório, project_id UUID nullable,
created_at/updated_at UTC e archived_at nullable. Índices por proprietário com
arquivamento/atualização, criação, atualização e projeto; GIN(tags) para filtros
exatos. Tags normalizadas pela aplicação (trim/minúsculas/únicas), sem tabela global.
O array evita joins/catálogos para etiquetas livres de cada nota. Um catálogo com
identidade, metadados ou renomeação global poderá justificar normalização futura.

A FK composta (project_id,owner_id) referencia projects(id,owner_id), com índice
único correspondente em projects. Impede vínculos entre proprietários mesmo em
escritas fora do serviço e em corridas. project_id null mantém a nota independente.
RESTRICT impede apagar projeto referenciado; futura exclusão deverá desvincular
explicitamente, nunca apagar notas em cascata. Arquivar não modifica associações.
A migration 20261113000400_notes não foi aplicada; validar em desenvolvimento antes
de produção. Rollback com remoção da tabela perde notas e exige backup/decisão.

## Decupagens — TASK-BE-006

Decupage segue a propriedade/índices/tags GIN de Note, com descrição nullable e FK
composta opcional (project_id,owner_id) para projetos próprios, RESTRICT, sem
cascata de projeto para decupagem. Nenhuma relação de evento existe neste recorte.
DecupageSegment pertence a uma decupagem; posições inteiras contíguas a partir de
zero. start_ms INT não negativo e end_ms INT nullable >= start_ms, com CHECKs SQL.
Milissegundos relativos até 2.147.483.647; description TEXT, timestamps UTC.
Limite operacional de 100 segmentos, validado sob bloqueio do pai na transação.
Índice (decupage_id,position), UNIQUE correspondente DEFERRABLE INITIALLY DEFERRED
na migration SQL para permitir trocas sem conflito intermediário. Essa restrição
adiada não é expressável no schema Prisma e deve ser preservada em migrations
futuras. Operações de segmentos bloqueiam o pai via UPDATE filtrado por owner_id,
validam o estado atual e persistem adições/edições/exclusões na mesma transação.
Qualquer falha reverte inclusive updated_at do pai.

Migration 20261113000500_decupages versionada, não aplicada. FK do segmento usa
CASCADE somente em relação ao pai; não existe endpoint para excluir esse pai.
Remoção explícita de segmento compacta posições. Rollback removendo tabelas perde
dados e requer backup/decisão, sem execução automática.

## Tarefas — TASK-BE-007

Task/tasks tem UUID, title varchar(200), descrição nullable, enums TaskStatus
(PENDING,IN_PROGRESS,COMPLETED,CANCELLED) e TaskPriority (LOW,MEDIUM,HIGH,URGENT,
nessa ordem PostgreSQL), start_date/due_date DATE nullable, completed_at,
owner_id, project_id opcional e auditoria/arquivo TIMESTAMPTZ. FK composta de
projeto/proprietário com RESTRICT; tarefa existe sem projeto. Índices:
(owner_id,status,due_date), (owner_id,priority), (owner_id,due_date),
(owner_id,project_id), (owner_id,created_at) e (owner_id,updated_at).
CHECKs SQL mantêm a ordem das datas e equivalência COMPLETED/completed_at não nulo.

Subtask/subtasks: UUID, task_id, título, completed boolean, position e timestamps.
FK do filho CASCADE somente ao pai (sem endpoint de exclusão de tarefa); remoção
individual preserva os irmãos. Índice (task_id,position) e UNIQUE adiada na migration
para permitir swaps. Preservar DEFERRABLE INITIALLY DEFERRED em migrations futuras,
pois não é expressável diretamente no schema Prisma. Coleção limitada a 100.

Mutações do pai bloqueiam via UPDATE filtrado por owner_id antes de ler/validar
estado e datas finais. Mutações de filhos usam o mesmo bloqueio e transação;
falta de propriedade/ordem inválida reverte tudo. completed_at é UTC, datas de
planejamento são civis; atraso usa a data local da preferência do usuário.
Migration 20261113000600_tasks versionada e não aplicada; validar em desenvolvimento
antes de produção. Rollback removendo tabelas/enums perde dados e exige backup.

## Recorrência — TASK-BE-008

TaskRecurrence/task_recurrences versiona regras por tarefa (UNIQUE task_id/version),
com frequência, intervalo, start/end DATE, weekdays INT[], count opcional, timezone,
state ACTIVE/PAUSED/ENDED e timestamps. A versão maior é a atual; PATCH cria novo ID,
sem apagar regras antigas. Limite operacional 100 versões. FK para Task; exclusão
em cascata apenas se uma operação administrativa futura apagar o pai.
TaskOccurrence/task_occurrences tem PK composta (rule_id,date), completed_at e
updated_at; materializa apenas ações individuais, não todas as datas possíveis.
TaskOccurrenceEvent/task_occurrence_events registra transições reais de conclusão
com UUID, completed e timestamp UTC, FK composta e índice rule_id/date/created_at.
Reabertura preserva eventos anteriores; repetições idempotentes não criam eventos.
Próxima ocorrência é derivada em tempo de leitura, nunca cache persistido obsoleto.

Leitura usa snapshot RepeatableRead e queries limitadas a 100 versões/10.000 estados
da versão selecionada. Mutações usam bloqueio do pai filtrado pelo proprietário,
leem estado atual e persistem regra/ocorrência/log na mesma transação. Chave única
e bloqueio impedem duplicatas concorrentes. Configuração+edição não duplicam Task.
CHECKs SQL validam intervalos/count/version, ordem de datas e faixa de weekdays.
Migration 20261113000700_task_recurrence versionada, não aplicada. Validar em banco
de desenvolvimento; rollback removendo tabelas/enums perde histórico e exige backup.

## Eventos — TASK-BE-009

Event/events guarda instantes start_at/end_at TIMESTAMPTZ(3), timezone IANA, título,
descrição/local opcionais, proprietário, projeto opcional e auditoria/arquivo.
Índices owner_id/start_at/end_at, owner_id/end_at e owner_id/project_id. FK composta
projeto/proprietário com RESTRICT impede vínculo externo, sem exclusão em cascata
de projetos. CHECK de término posterior e duração máxima de 2.678.400 segundos.

EventRecurrence/event_recurrences reutiliza os enums de frequência/estado e o
gerador civil de tarefas. Versões UNIQUE(event_id,version), start_date/end_date,
weekdays/count/timezone e instantes anchor_start_at/anchor_end_at congelam a hora
local e duração de cada versão. Versão maior é a atual, até 100. EventException/
event_exceptions tem PK(rule_id,date original), snapshot de título/descrição/local,
instantes finais, cancelled e updated_at. Índice rule_id/start_at/end_at; datas
não são materializadas salvo edição/cancelamento/restauração. CHECK de duração em
regra/exceção e de calendário/limites como em tarefas.

Reads RepeatableRead; mutações bloqueiam Event por owner_id e persistem metadados,
regra ou upsert de exceção na mesma transação. Leituras limitadas a 100 versões e
10.000 exceções da selecionada. Relações em cascata apenas do evento para regras e
destas para exceções (nenhum endpoint exclui evento). Migration
20261113000800_events versionada, não aplicada; validar em desenvolvimento antes
de produção. Rollback perde eventos/exceções e exige backup/decisão.
