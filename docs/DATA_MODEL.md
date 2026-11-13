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
