# Estado do Projeto MAI

## TASK-BE-020 — revisão e correções do fluxo (para revisão)

Base main `8b740f0`, BE-019 incorporada no PR #21. Branch
`test/BE-020-notification-hardening`. Corrigida lacuna de renovação contínua:
Cron percorre regras com cursor persistente, lote de 20 regras, transação por
passo e reaproveitamento do planejador/motor existente. Migration aditiva
20261115000300_notification_renewal_cursor **não aplicada**. Corrigido folding
RFC 2047 de assuntos MIME longos, sem dividir UTF-8. Contrato OpenAPI preservado.
Revisão de concorrência, estados, ownership, hooks transacionais, resumo e política
sem retry de envio registrada em [NOTIFICATION-HARDENING](NOTIFICATION-HARDENING.md),
com achados, correções, riscos e roteiro de aceite integrado/produção. Nenhuma
credencial, envio real, recurso remoto ou deploy. Neon/Queues/Cron/Gmail reais
continuam pendentes; mocks não validam locks, savepoints ou rollback PostgreSQL.


## TASK-BE-019 — entrega por e-mail, resumo e histórico (para revisão)

Base main `5e7b3aa` (BE-018, PR #20). Branch `feat/BE-019-email-delivery-digest`.
Adaptador Gmail API HTTP/OAuth2 real, templates HTML/texto, planner diário limitado
com identidade owner/dia local e resumo reutilizando dashboard/calendário.
Consumer reserva entrega, revalida e registra aceite/falha sem retry de envio;
resultado incerto após aceite não autoriza reenvio automático.
GET /notifications e GET /notifications/:id autenticados, com paginação/filtros,
ownership e DTO público sem leases. OpenAPI atualizado. Sem migration nova.
EMAIL_DELIVERY_ENABLED=false por padrão; nenhum e-mail, acesso Neon, recurso remoto
ou deploy nesta tarefa. Configuração, decisão OAuth, limites e cenários pendentes
em [EMAIL-DELIVERY](EMAIL-DELIVERY.md). Os registros anteriores são históricos.


## Atualização BE-018 (branch de implementação)

Base main `afccbe3`: BE-017 incorporada no PR #19. Branch
`feat/BE-018-cron-queues` implementa Cron, reserva transacional limitada com lease
recuperável **somente para publicação**, producer e consumer sem provedor.
PUBLISHED continua distinto de SENT; não há envio fictício. Política técnica de
retry/DLQ e configuração em [CRON-QUEUES](CRON-QUEUES.md).
567 testes locais/32 arquivos, lint/typecheck/build dry-run aprovados. Nenhuma
migration nova/aplicada, fila remota, deploy ou credencial. Neon e Cron/Queues reais
não executados; revisão/merge pendentes. O histórico abaixo não certifica este recorte.


Levantamento de TASK-DOC-BE-001 em 2026-11-14. Este documento descreve o código
observado, não certifica operação em produção. Atualizar junto de cada entrega que
mude o estado; escopo em [MVP_SCOPE](MVP_SCOPE.md), sequência em
[NEXT_STEPS](NEXT_STEPS.md) e regras em [DEVELOPMENT_WORKFLOW](DEVELOPMENT_WORKFLOW.md).

## Atualização BE-017 (branch de implementação)

Base main `013d49e`: BE-016 incorporada no PR #18. A branch
`feat/BE-017-domain-reminders` integra os domínios à outbox na mesma transação
e adiciona GET/PUT /reminders/{sourceType}/{sourceId}. Janela limitada e opt-in
explícito, sem envio/dispatcher. Revisão/merge e Neon real pendentes; sem migration
nova. Lint/typecheck/build e 538 testes locais em 30 arquivos passaram (14 novos);
novo recorte OpenAPI validado. As tabelas anteriores são históricas e não
comprovam validação integrada.

## Atualização histórica BE-016 (incorporada no PR #18)

Base main `db63079`: BE-015 incorporada no PR #17. A branch
`feat/BE-016-notification-outbox` prepara ReminderRule, NotificationOutbox e
NotificationDeliveryLog, com migration 20261115000200_notification_outbox (décima
primeira versionada, não aplicada), serviços internos e trilha transacional.
Nenhum endpoint, integração automática aos CRUDs, processamento de fila, Cron ou
envio foi entregue. Os próximos componentes e limites estão em
[NOTIFICATIONS-OUTBOX](NOTIFICATIONS-OUTBOX.md). Revisão/merge e Neon real pendentes.
Foram aprovados 524 testes locais em 28 arquivos (26 novos), lint/typecheck/build
e parsing sintático do SQL (sem execução). As tabelas históricas abaixo não
representam aprovação deste recorte.

## Atualização histórica BE-015 (incorporada no PR #17)

Base main `cc16ef3`: BE-014 incorporada pelo PR #16. A branch
`feat/BE-015-user-preferences` implementou GET/PATCH /me/preferences, incorporada
no PR #17. Reutiliza nome/fuso/e-mail e acrescenta opt-in/HH:mm do resumo diário
na relação existente; /auth/me preservado. Migration 20261115000100_user_preferences
é a décima versionada e não foi aplicada. Nenhuma credencial, e-mail, frontend ou
deploy nesta entrega; Neon real continua pendente. Foram aprovados 498 testes
locais em 26 arquivos (47 novos), lint/typecheck/build e o novo recorte OpenAPI.
Ver API.md e TESTING.md.
As tabelas seguintes preservam o levantamento histórico DOC-BE-001, não o estado
de aprovação/merge da BE-015.

## Atualização histórica BE-014 (já incorporada no PR #16)

Base main `0ac482d`: BE-013 incorporada pelo PR #15. A branch
`feat/BE-014-dashboard-api` implementou GET /dashboard, incorporado no PR #16.
Resumo no fuso da sessão, atraso limitado a 30 dias anteriores, próximos itens em
sete dias, contagens com unidades/janelas explícitas e listas limitadas. Reutiliza
o calendário, sem nova tabela/migration ou frontend. A UI do dashboard continua
pendente (F4-06); Neon real e plano/custo SQL não foram validados. API.md descreve
o contrato definitivo. Lint/typecheck/build e 451 testes locais em 25 arquivos
passaram (21 novos); recorte OpenAPI e exemplo validados, contratos anteriores
preservados. As tabelas históricas abaixo são o retrato DOC-BE-001 e
não significam que BE-014 já esteja na main.

## Atualização histórica BE-013 (já incorporada no PR #15)

Após o levantamento DOC-BE-001 abaixo, BE-013 incorporou PUBLICATION ao calendário
pelo PR #15, na main `0ac482d`. Sua base de implementação foi `cc8fe44`
(merge documental PR #14). Seleção explícita via types; padrão
TASK,EVENT preservado. Publicações próprias datadas e não arquivadas/canceladas
aparecem como pontos UTC sem duração/fallback; consulta limitada no Prisma.
O frontend deste ticket não foi alterado; FE-016/017 e integração Neon permanecem
pendentes. As tabelas/SHAs seguintes preservam o retrato das mains em DOC-BE-001,
são anteriores à incorporação de BE-013. Na entrega BE-013: lint/typecheck/build e
430 testes locais em 23 arquivos passaram (38 novos); OpenAPI do calendário
validado. Não houve execução Neon, migrations ou deploy. Ver API.md e TESTING.md.

## Bases inspecionadas e significado de conclusão

| Repositório | Main inspecionada | Evidência de incorporação |
|---|---|---|
| [mai-backend](https://github.com/ViniciusBitencourt98/mai-backend) | `b1e5cde4226493e2c34ade66807364d5395b3a7e` | Merge PR #13, BE-012 |
| [mai-frontend](https://github.com/ViniciusBitencourt98/mai-frontend) | `f505ced5433842d1178d00ee5bcdb26665843094` | Merge PR #18, FE-015 |

Foram lidos código, manifests, contratos, testes, relatórios e histórico Git dos
merges. A API do GitHub não foi usada como evidência de CI/review. Checkboxes do
backlog não bastam para concluir uma funcionalidade. Distinguir sempre:

- **Implementado:** arquivos e comportamento presentes no código.
- **Incorporado:** commit alcançável pela main inspecionada, com merge identificado.
- **Teste isolado/HTTP simulado:** lógica, componentes ou transporte exercitados
  com persistência/rede substituída; não comprova banco real.
- **Runtime local:** workerd/Express executados; sem banco isso não comprova Neon.
- **Integração real:** frontend → API → Prisma → Neon de desenvolvimento, com
  persistência, isolamento e transações demonstrados. Continua pendente.
- **Manual:** registrar quem executou, cenário e ambiente; não extrapolar relato.
- **Produção:** exige evidência de publicação e smoke hospedado. Não comprovada
  por este levantamento; Vercel/Workers são destinos arquiteturais, não prova de deploy.

## Acompanhamento por funcionalidade

Em todas as linhas implementadas abaixo, o código está nas mains citadas.
"Cliente HTTP" indica implementação do cliente, não E2E real aprovado.

| Funcionalidade | Backend | Frontend | Evidência e pendência |
|---|---|---|---|
| Fundação/runtime | Express 5/TS, adaptador Workers, `/health`, erros/CORS | React 19/Vite/TS/Tailwind 4, rotas, shell e design system | Testes locais; PoCs remotas e produção não comprovadas |
| Autenticação | Login/me/logout, sessões opacas, CSRF, throttling, bootstrap administrativo | Cliente de sessão/cookies, guarda e logout; FE-006 | HTTP isolado e testes de UI; login persistente real pendente |
| Projetos | CRUD/arquivo/restauração, filtros; BE-004 | Formulários/lista/detalhes e cliente HTTP; FE-007 | Testes isolados; Neon e uso conjunto pendentes |
| Anotações | Independentes, tags, título, projeto opcional próprio; BE-005 | CRUD/cliente HTTP; FE-008 | Busca ampliada e vínculo a evento do requisito original não implementados |
| Decupagens/segmentos | CRUD, timecodes, ordem transacional, projeto opcional; BE-006 | Editor/cliente HTTP e ordenação; FE-009 | FK, rollback e concorrência reais pendentes; sem mídia processada |
| Tarefas/subtarefas | CRUD/status/prioridade, datas civis, checklist; BE-007 | Cliente HTTP, formulários e checklist; FE-010 | Prazo com hora não implementado no recorte; persistência real pendente |
| Recorrência de tarefas | Regras versionadas, estados individuais, suspensão/retomada/fim; BE-008 | Editor e ocorrências; FE-011 | Lógica civil/DST testada isoladamente; concorrência Neon pendente |
| Eventos/séries | Instantes UTC, fuso, regras/exceções e ocorrência movida/cancelada; BE-009 | CRUD/cliente HTTP e edição de séries; FE-012 | Não confundir mestre com ocorrência; E2E real pendente |
| Calendário | `GET /calendar`, TASK/EVENT, paginação/janela limitada; BE-010/011 | Dia/semana/mês e filtros no servidor/URL; FE-013/014 | HTTP simulado; publicações ainda ausentes nos dois lados |
| Publicações | CRUD editorial completo e manual; BE-012 | UI preparatória/demo; FE-015, sem adaptador HTTP editorial | FE-016 pendente; divergências detalhadas abaixo |
| Dashboard básico | Sem endpoint agregador | `/app/dashboard` é placeholder de ModulePage | F4-05/F4-06 pendentes; navegação não é dashboard funcional |
| Perfil/preferências | Sessão lê timezone/emailEnabled; sem endpoint de edição de perfil/preferências | Sem tela funcional de preferências | F1-08 pendente; preferências locais de filtros não editam perfil |
| E-mail/outbox/resumo | Sem modelos outbox, handlers Cron/Queue ou adaptador Gmail implementados | Sem fluxo de notificações integrado | F0-09/10/11 e F5-01–14 pendentes |
| Responsividade/estilo | Contratos e STYLE como referência | Tokens e componentes próprios; testes/relatos Chromium desktop/mobile | Desenvolvedor já executou frontend localmente; ajustes visuais pendentes |
| ICS/Google e demais V2 | Não implementados | Não implementados | Fora do MVP por decisão DOC-BE-001; não bloqueiam entrega |

## Publicações: contrato já disponível, integração ainda não

Backend: [ADR-004](ADR-004-EDITORIAL-PUBLICATIONS.md),
[API implementada](API.md#publicações-editoriais--task-be-012) e [OpenAPI](openapi.json).
`/publications` oferece GET/POST, GET/PATCH por ID e POST archive/restore, com
ownerId da sessão, CSRF, projeto opcional e filtros/paginação. Estados manuais
IDEA/PLANNED/IN_PRODUCTION/READY/PUBLISHED/CANCELLED. scheduledAt e publishedAt são
opcionais; editar status não fabrica nem limpa a data efetiva.

No frontend, `src/app/App.tsx` não injeta PublicationsRepository. As rotas privadas
`/app/publicacoes` e variantes mostram integração indisponível quando autenticadas;
`/design-system/publications` usa memória explícita, sem HTTP/storage. A presença
de formulário funcional na demo não comprova persistência.

O [relatório FE-015](https://github.com/ViniciusBitencourt98/mai-frontend/blob/f505ced5433842d1178d00ee5bcdb26665843094/docs/TASK-FE-015-PUBLICATIONS.md) registra os limites desse recorte.
FE-016 precisa adaptar o modelo provisório ao contrato incorporado:

| Modelo provisório FE-015 | Contrato BE-012 | Ação necessária |
|---|---|---|
| plannedAt / observations | scheduledAt / notes | Mapear/renomear na integração |
| VIDEO, SHORT e catálogo reduzido | LONG_VIDEO, SHORT_VIDEO, REELS, STORIES, IMAGE, CAROUSEL, TEXT, OTHER | Consumir os enums documentados, sem mapear silenciosamente formatos ambíguos |
| Plataformas sem FACEBOOK | Inclui FACEBOOK e demais valores da ADR | Completar opções |
| SCHEDULED; data efetiva exigida em PUBLISHED e vedada em outros estados | Sem SCHEDULED; publishedAt opcional e preservado em qualquer estado | Alinhar formulário/validação ao backend |
| Filtro civil inclusivo, sem projeto, sort por título, página demo de 12 | from/to instantes [from,to), sem filtro withoutProject, sort scheduledAt/updatedAt, page/limit/hasMore | Definir tradução dos filtros e limites reais; não inventar suporte servidor |
| timezone de apresentação | Instantes UTC, sem timezone persistido em Publication | Manter fuso na UI, sem enviá-lo como campo desconhecido |

BE-013 ampliará o contrato de calendário; FE-017 depende dele e da integração FE-016.
Nenhum dos três foi implementado por esta tarefa documental.

## Modelos, rotas e migrations

Schema real em [prisma/schema.prisma](../prisma/schema.prisma): TechnicalProbe;
User/UserPreferences/Session/AuthThrottle; Project; Note; Decupage/DecupageSegment;
Task/Subtask/TaskRecurrence/TaskOccurrence/TaskOccurrenceEvent;
Event/EventRecurrence/EventException; Publication e enums correspondentes.
Não existem tabelas persistentes de calendário/dashboard/outbox; calendário é projeção.

O OpenAPI contém 54 caminhos sob `/health`, `/auth`, `/projects`, `/notes`,
`/decupages`, `/tasks`, `/events`, `/calendar`, `/publications`. Rotas concretas em
`src/routes/`; não assumir implementados `/api/v1/*`, `/me`, dashboard, notificações
ou exportações do catálogo inicial proposto em API.md.

Nove migrations estão versionadas em [prisma/migrations](../prisma/migrations):
`20261113000100_technical_probe`, `20261113000200_authentication`,
`20261113000300_projects`, `20261113000400_notes`, `20261113000500_decupages`,
`20261113000600_tasks`, `20261113000700_task_recurrence`, `20261113000800_events`,
`20261114000100_publications`. **Nenhuma foi aplicada pelos agentes nas execuções
registradas.** Não foi consultado o estado do banco do desenvolvedor; não inferir
que um banco externo está atualizado. Não criar/aplicar migrations neste ticket.

## Últimas incorporações verificadas

| Repositório | Tarefa | PR incorporado | Resultado no código |
|---|---|---|---|
| Backend | BE-009 | [#10](https://github.com/ViniciusBitencourt98/mai-backend/pull/10) | Eventos/séries/exceções |
| Backend | BE-010 | [#11](https://github.com/ViniciusBitencourt98/mai-backend/pull/11) | Calendário TASK/EVENT |
| Backend | BE-011 | [#12](https://github.com/ViniciusBitencourt98/mai-backend/pull/12) | Revisão Code First da Fase 3, correção de ano civil |
| Backend | BE-012 | [#13](https://github.com/ViniciusBitencourt98/mai-backend/pull/13) | CRUD editorial |
| Frontend | FE-012 | [#14](https://github.com/ViniciusBitencourt98/mai-frontend/pull/14) | Eventos/séries |
| Frontend | FE-013 | [#15](https://github.com/ViniciusBitencourt98/mai-frontend/pull/15) | Agenda |
| Frontend | FE-014 | [#17](https://github.com/ViniciusBitencourt98/mai-frontend/pull/17) | Filtros da agenda |
| Frontend | FE-015 | [#18](https://github.com/ViniciusBitencourt98/mai-frontend/pull/18) | UI editorial preparatória |

"Incorporado" não significa que todos os critérios globais F0–F6 estejam cumpridos
ou que a ADR tenha aprovação de produto independente. Não marcar gates remotos.

## Evidências de testes e limites

| Evidência | Fonte/alcance | O que não comprova |
|---|---|---|
| Backend: lint/typecheck/build e 392 testes em 22 arquivos aprovados | Reexecutados em DOC-BE-001 sobre a base acima; [histórico BE-012](TESTING.md#task-be-012--publicações-editoriais) registra os mesmos resultados | Não comprova Neon nem deploy |
| 74 testes editoriais dentro dos 392 | DTO/service/HTTP Express local, com repository fake; predicados Prisma com client mockado | Não são 74 testes de banco |
| workerd local | Suíte inclui Worker real, HTTP/CORS/erros/crypto; persistência de domínio isolada | Não valida o adapter conectado ao Neon |
| Integração Neon disponível: 13 casos em sete arquivos | `tests/integration/*.integration.ts`; histórico registra skipped sem URLs | Nenhum caso Neon aprovado; não reexecutados nesta tarefa |
| Frontend: 435 testes/24 arquivos, lint/typecheck/build aprovados | Evidência registrada em main, [relatório de testes frontend](https://github.com/ViniciusBitencourt98/mai-frontend/blob/f505ced5433842d1178d00ee5bcdb26665843094/docs/TESTING.md), FE-015; não reexecutada por DOC-BE-001 | Não é nova medição nem E2E com backend real |
| Frontend Chromium desktop/mobile | Relatórios FE-008–014 usam HTTP simulado; FE-015 exercita demo em memória | Não comprova cookies/sessões reais com Neon |
| Frontend executado localmente pelo desenvolvedor | Relato fornecido no pedido; refinamentos visuais ainda pendentes | Não afirma aprovação de todos os fluxos nem banco real |
| Validação manual integrada e produção | Sem evidência comprovada neste levantamento | Permanecem pendentes, não "passaram" |

Existem testes de integração de probe/projetos/notas/decupagens/tarefas/recorrência/
eventos. Publicações ainda precisam de cenários reais; o agregado de calendário
precisa de fluxo completo com sessões e dados reais. Roteiro inicial em
[F3-BACKEND-NEON-VALIDATION](F3-BACKEND-NEON-VALIDATION.md).

## Limitações conhecidas e inconsistências identificadas

- `binaries.prisma.sh` retornou 403 na geração CLI. O client desta instância foi
  gerado com APIs oficiais 7.10.1 conforme [PRISMA-NEON-LOCAL](PRISMA-NEON-LOCAL.md),
  sem desabilitar TLS/checksum; isso não prova npm ci em ambiente novo.
- A validação global do OpenAPI registrada em BE-012 encontra respostas legadas
  de `/decupages` sem description obrigatória. O recorte editorial e dez exemplos
  passaram; correção documental do contrato legado requer tarefa própria.
- Catálogo `/api/v1` de API.md e tabelas lógicas iniciais de DATA_MODEL são propostas;
  as seções implementadas, o schema e as rotas reais prevalecem para integração.
- O backlog antigo sugeria monorepo e exigia ICS em F4-09/F6-08. DOC-BE-001 corrige
  a organização e retira esse bloqueio, preservando IDs de ICS como V2.
- Gates remotos antigos não devem impedir trabalho Code First nem ser declarados
  atendidos por mocks. [Workflow](DEVELOPMENT_WORKFLOW.md) explicita essa distinção.
- O relatório frontend FE-015 ainda diz que o contrato editorial estava pendente;
  era verdade naquele recorte, mas BE-012 já está na main observada. Frontend foi
  apenas consultado e precisa atualizar sua documentação no próximo PR próprio.
- CI backend está em `ci.example.yml`, modelo inativo; frontend possui `ci.yml`.
  Não há evidência de runs do GitHub Actions inspecionados nesta tarefa.
- Persistência real, segurança com dois usuários, backup/restauração, Gmail/Queues/
  Cron e publicação hospedada continuam sem aceite comprovado. Próximas ações
  rastreáveis em [NEXT_STEPS](NEXT_STEPS.md).

Validação BE-019: lint/typecheck/build dry-run aprovados; **595 testes em 35
arquivos passaram**, zero skips na suíte local. Inclui composição concorrente
consumer+serviço (um aceite do provedor e um SENT com mensagens duplicadas).
O contrato OpenAPI anterior permaneceu idêntico; novos endpoints têm segurança,
DTOs e erros documentados. Validação externa Neon/Gmail/Cron/Queues não executada.

Validação BE-020 nesta entrega: lint e typecheck aprovados; **603 testes em 36
arquivos** aprovados, zero skips locais (8 regressões novas). Build Wrangler
dry-run aprovado, sem upload. Prisma Client regenerado com APIs oficiais 7.10.1,
sem desativar TLS/checksum e sem alterar dependências/lockfile. OpenAPI anterior
idêntico à main; segurança e respostas das notificações conferidas. git diff
--check aprovado. Infraestrutura externa e migration real não executadas.
