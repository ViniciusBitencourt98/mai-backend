# Backlog completo e rastreável — MVP

Escopo vigente: [MVP_SCOPE](MVP_SCOPE.md); evidências de implementação/merge/validação em [PROJECT_STATUS](PROJECT_STATUS.md), próximas tarefas em [NEXT_STEPS](NEXT_STEPS.md). Política Code First em [DEVELOPMENT_WORKFLOW](DEVELOPMENT_WORKFLOW.md). Os gates de integração real permanecem pendentes, mas não impedem implementação isolada sem credenciais.

Cada linha é **uma task** para GitHub Issue/PR ou Codex. Marque `[x]` somente após teste e revisão. Dependências referem-se a outros IDs deste arquivo. **Não executar tickets de V2 no MVP.**

## Padrão de execução por ticket

- **Entrada:** ID, pré-requisitos, arquivos de referência e contrato aplicável.
- **Saída:** código, schema/migration (quando necessário), DTO Zod, repository/service/Express route, UI e testes pertinentes, sem alterações fora da task.
- **Aceite:** critério na linha + `docs/TESTING.md` + `AGENTS.md`.
- **Estado:** `[ ]` pendente; `[x]` concluído após PR revisado.

## Fase 0 — PoCs e fundação

| ID | Task | Dependências | Critério de aceite |
|---|---|---|---|
| `F0-01` | ☐ Revisar escopo/decisões e criar repositório | Documentos de referência disponíveis; decisões de stack fixadas | README, requisitos e ADR lidos; tickets rastreáveis |
| `F0-02` | ☐ Preparar ambientes e scripts dos dois repositórios independentes | F0-01 | mai-frontend e mai-backend com manifests/lockfiles/scripts próprios; sem monorepo |
| `F0-03` | ☐ Criar web React/Vite/TypeScript | F0-02 | SPA sobe localmente com tela inicial e build |
| `F0-04` | ☐ Configurar Tailwind e tokens STYLE.md | F0-03 | Montserrat/Inter e tokens aplicados em componentes de exemplo |
| `F0-05` | ☐ Criar API Express/TypeScript em Worker | F0-02 | /health responde via Wrangler local e remoto sem servidor Node persistente |
| `F0-06` | ☐ Validar Express remoto e Node compatibility | F0-05 | Deploy documentado; request body, middlewares, status HTTP e CORS funcionam |
| `F0-07` | ☐ Provisionar Neon e banco de desenvolvimento | F0-02 | Credenciais em secrets, banco acessível somente via backend |
| `F0-08` | ☐ Prisma runtime Workers: query e transação | F0-06,F0-07 | Consulta, insert e transação funcionam em Worker remoto; driver documentado |
| `F0-09` | ☐ Configurar Cloudflare Queues producer/consumer | F0-05 | Mensagem de teste produzida, consumida, ack; limites conferidos |
| `F0-10` | ☐ Configurar Cron Trigger de teste | F0-05 | Execução agendada registrada em log remoto |
| `F0-11` | ☐ PoC de Gmail API HTTPS e avaliar SMTP | F0-05 | Enviar teste a destinatário permitido; autenticação, limitação e falha documentadas |
| `F0-12` | ☐ Padrões de código, lint, formato, typecheck, testes e CI | F0-02,F0-05 | Scripts raiz e pipeline rodam; exemplo de teste passa |
| `F0-13` | ☐ Configurar env, deploys, CORS e docs setup | F0-06,F0-08 | Deploy web/API reproduzível; .env.example e secrets sem vazamento |

## Fase 1 — Identidade e estrutura

| ID | Task | Dependências | Critério de aceite |
|---|---|---|---|
| `F1-01` | ☐ Escolher e registrar mecanismo de autenticação | F0-08 | ADR aprovado; sessão segura compatível com Workers |
| `F1-02` | ☐ Modelar usuário, preferências e migração inicial | F1-01 | FKs, índices e migration testada |
| `F1-03` | ☐ Implementar login, logout e sessão | F1-02 | Fluxo seguro funcional e refresh/expiração definidos |
| `F1-04` | ☐ Implementar middleware auth/owner/validação | F1-03 | Rotas privadas protegidas; IDs externos de outra conta bloqueados |
| `F1-05` | ☐ Estabelecer padrão de erros, DTOs e OpenAPI | F1-04 | Zod e HTTP mapping documentados e testados |
| `F1-06` | ☐ Criar shell responsivo de navegação | F0-04,F1-03 | Menu desktop/mobile e estados básicos acessíveis |
| `F1-07` | ☐ Criar biblioteca de formulários, badges e listas | F1-06 | Componentes de acordo com STYLE.md reutilizáveis |
| `F1-08` | ☐ Implementar perfil e preferências de fuso/e-mail | F1-02,F1-04 | Usuária altera fuso e email; persistência testada |
| `F1-09` | ☐ Testar isolamento de dados e smoke de autenticação | F1-03,F1-04 | Usuário A não lê/muta/vincula B; teste integração passa |

## Fase 2 — Conteúdo independente e projetos

| ID | Task | Dependências | Critério de aceite |
|---|---|---|---|
| `F2-01` | ☐ Criar schema Prisma projects e migration | F1-09 | Campos e arquivamento preservam dados |
| `F2-02` | ☐ Implementar CRUD API projects e filtros | F2-01 | DTOs, service, repository, paginação e testes completos |
| `F2-03` | ☐ Implementar telas de projetos | F2-02,F1-07 | Criar, listar, editar, arquivar e feedback de erros |
| `F2-04` | ☐ Decidir cardinalidade dos vínculos de notas | F1-09 | ADR O-04 fechado sem obrigatoriedade de projeto/evento |
| `F2-05` | ☐ Modelar notes, links e índices | F2-04 | Schema aceita zero ou vínculos opcionais; migration testada |
| `F2-06` | ☐ Implementar CRUD API notes | F2-05 | Título requerido, conteúdo opcional, propriedade validada, testes |
| `F2-07` | ☐ Implementar busca/filtros de notas e vínculos | F2-06 | Busca texto, com/sem vínculo, projeto, evento, data sem leakage |
| `F2-08` | ☐ Construir UI notas, editor e captura rápida | F2-06,F2-07 | Criar sem vínculo, editar, desvincular e pesquisar no celular |
| `F2-09` | ☐ Modelar decoupages e segments | F2-04 | Timecodes em ms, ordenação e migration testada |
| `F2-10` | ☐ Implementar CRUD API decupagens e segmentos | F2-09 | Zod valida timecodes e vínculos; endpoints testados |
| `F2-11` | ☐ Construir editor decupagem e timecodes | F2-10,F1-07 | Criar nota livre e segmentos; editar/reordenar/remover |
| `F2-12` | ☐ Implementar busca e filtros de decupagem | F2-10,F2-11 | Busca conteúdo, trechos e com/sem vínculo |
| `F2-13` | ☐ Testes E2E notas, decupagens e projetos | F2-03,F2-08,F2-12 | Fluxos independentes sem projeto; vincular depois e preservar dados |

## Fase 3 — Tarefas, eventos, agenda

| ID | Task | Dependências | Critério de aceite |
|---|---|---|---|
| `F3-01` | ☐ Decidir precisão de datas e recorrência | F1-09 | ADRs O-06 e O-07 fechados; casos de fuso escritos |
| `F3-02` | ☐ Modelar tasks/subtasks e migration | F3-01 | Prazo com/sem hora; status e índice; schema validado |
| `F3-03` | ☐ Implementar CRUD API tasks com permissões | F3-02 | DTOs, status, prioridade, filtros e testes |
| `F3-04` | ☐ Implementar conclusão, cancelamento e checklist | F3-03 | Concluir registra data; checklist e regras corretos |
| `F3-05` | ☐ Construir listagem, filtros e formulário de tarefas | F3-03,F3-04 | Mobile e desktop, incluir captura rápida |
| `F3-06` | ☐ Modelar events e migration | F3-01 | Fim > início, local, projeto opcional e indices |
| `F3-07` | ☐ Implementar CRUD API events | F3-06 | Criar/editar/excluir; validar início e término |
| `F3-08` | ☐ Implementar formulário/listagem de eventos | F3-07 | Eventos pontuais e semanais editáveis na UI |
| `F3-09` | ☐ Criar motor de recorrência de janela limitada | F3-01 | Diária/semanal/mensal, fuso e limites, testes de borda |
| `F3-10` | ☐ Persistir regras e exceções de recorrência | F3-09 | Mover/cancelar ocorrência sem afetar restante da série |
| `F3-11` | ☐ Adicionar recorrência de tarefas | F3-02,F3-09,F3-10 | Concluir ocorrência não conclui futuras; estado por ocorrência |
| `F3-12` | ☐ Adicionar recorrência de eventos | F3-06,F3-09,F3-10 | Atualizar instância ou série explicitamente |
| `F3-13` | ☐ Criar endpoint agregado /calendar | F3-03,F3-07,F3-11,F3-12 | Janela filtra tipos e limita expansão; ownership |
| `F3-14` | ☐ Montar agenda diária/semanal/mensal | F3-13 | Tipos identificáveis e clique abre entidade original |
| `F3-15` | ☐ Implementar filtros de agenda, all-day e tasks sem hora | F3-14 | Tarefa sem horário não bloqueia faixa, filtros persistem |
| `F3-16` | ☐ Testar fuso, recorrência, conflitos e exceções | F3-11,F3-12,F3-15 | Testes para séries, timezone, cancelamento e atualização |
| `F3-17` | ☐ E2E tarefa e gravação recorrente | F3-05,F3-08,F3-16 | Tarefa concluída e ocorrência remarcada reproduzíveis na UI |

## Fase 4 — Editorial e dashboard (ICS transferido para V2)

| ID | Task | Dependências | Critério de aceite |
|---|---|---|---|
| `F4-01` | ☐ Fechar status mínimos e schema publications | F3-17 | ADR O-08 e migration publicados |
| `F4-02` | ☐ CRUD REST publications e filtros | F4-01 | DTOs e regras manuais; teste status e ownership |
| `F4-03` | ☐ UI lista, editor e filtros de publicações | F4-02 | Criar publicação e alterar status sem publicar externamente |
| `F4-04` | ☐ Exibir publicações na agenda unificada | F4-02,F3-15 | Calendário suporta filtro editorial e horário |
| `F4-05` | ☐ Construir endpoint agregador dashboard | F3-13,F4-02 | Hoje, vencidas, próximos eventos/publicações por fuso |
| `F4-06` | ☐ Construir dashboard com ações rápidas | F4-05,F2-08,F3-05 | Usuária vê dia e inicia tarefa/nota rapidamente |
| `F4-07` | V2 — Implementar gerador RFC5545 de arquivo ICS | F3-12; fora do MVP | ID preservado; não bloqueia F4-09/F5/lançamento |
| `F4-08` | V2 — Criar endpoint/export UI para eventos ICS | F4-07; fora do MVP | ID preservado; inclui futura importação por arquivo no Google Calendar, sem sync |
| `F4-09` | ☐ Testar fluxos essenciais editorial/agenda/dashboard | F4-03,F4-04,F4-06 | Publicação e dashboard com API/Neon reais em validação local; sem dependência ICS |

## Fase 5 — Lembretes e operação assíncrona

| ID | Task | Dependências | Critério de aceite |
|---|---|---|---|
| `F5-01` | ☐ Fechar política de horários e falhas | F4-09 | ADR O-09/O-10; no automatic retry documentado |
| `F5-02` | ☐ Modelar reminder rules, outbox e delivery log | F5-01 | Chave idempotência, lease, statuses, índices e migração |
| `F5-03` | ☐ Integrar criação/reagendamento de outbox ao domínio | F5-02,F3-03,F3-07,F4-02 | Salvar mudança+outbox em tx; cancelar lembrete obsoleto |
| `F5-04` | ☐ Implementar configuração UI/API de lembretes | F5-02,F1-08 | Antecedência e preferências validadas |
| `F5-05` | ☐ Implementar resumo diário por fuso | F5-02,F4-05 | Uma intenção por usuário/dia local; conteúdo correto |
| `F5-06` | ☐ Implementar dispatcher Cron com reserva segura | F0-10,F5-02 | Busca vencidos sem duplicar disputa; lease recuperável |
| `F5-07` | ☐ Implementar publicação em Cloudflare Queues | F0-09,F5-06 | Apenas id; marcar aceite/erro de publicação |
| `F5-08` | ☐ Criar adaptador Gmail em produção controlada | F0-11,F5-01 | OAuth/SMTP validado e segredo seguro; e-mail teste |
| `F5-09` | ☐ Implementar consumer com validação de vigência | F5-07,F5-08 | Ignora mensagem obsoleta, idempotência por status/versão |
| `F5-10` | ☐ Persistir sucesso e falha de envio | F5-09 | SENT significa aceite, FAILED persiste erro sem retry |
| `F5-11` | ☐ Configurar queue ack e política sem retry automático | F5-10 | Erro do provedor não reentra automaticamente na fila |
| `F5-12` | ☐ Expor histórico de notificações/falhas na UI | F5-10 | Usuária/admin consulta status e motivo com segurança |
| `F5-13` | ☐ Implementar comando manual seguro de reenvio/encaminhamento | F5-12 | Ação explícita, revalidação, auditoria, não automático |
| `F5-14` | ☐ Testar E2E Cron → Queue → Gmail/outbox | F5-03,F5-05,F5-11,F5-13 | Duplicata, falha e obsolescência cobertas |

## Fase 6 — Qualidade e lançamento

| ID | Task | Dependências | Critério de aceite |
|---|---|---|---|
| `F6-01` | ☐ Executar suite total e corrigir regressões | F5-14 | Lint/typecheck/build/testes verdes |
| `F6-02` | ☐ Aplicar verificações de segurança de auth e CORS | F6-01 | Sem IDOR e segredos; throttling/CSRF conforme auth |
| `F6-03` | ☐ Executar revisão de acessibilidade e responsividade | F6-01 | Teclado, focos, contraste e layouts 360px/desktop |
| `F6-04` | ☐ Testar exportação de dados, backup e restore | F0-07,F6-01 | Procedimento documentado e recuperação provada |
| `F6-05` | ☐ Documentar procedimento de falhas e reenvio manual | F5-13 | Runbook fácil de seguir; status explicados |
| `F6-06` | ☐ Configurar observabilidade, logs e alertas básicos | F5-14 | Logs sanitizados, erros de jobs identificáveis |
| `F6-07` | ☐ Configurar deploy de produção web/API e secrets | F0-13,F6-01 | Deploy repetível com env correto; pipeline verde |
| `F6-08` | ☐ Executar smoke em produção com conta de teste | F6-07 | Validar auth/CRUD, agenda/publicações/dashboard e e-mail; sem ICS, execução manual autorizada |
| `F6-09` | ☐ Testar quotas gratuitas e documentar custo | F6-07 | Limites/risco de suspensão registrados, sem surpresas |
| `F6-10` | ☐ Validar UX com usuária no celular | F6-08 | Jornadas reais testadas, observações registradas |
| `F6-11` | ☐ Corrigir blockers do teste e congelar MVP | F6-10 | Falhas críticas resolvidas; aceite assinado/informal |
| `F6-12` | ☐ Publicar manual rápido e lista pós-MVP | F6-11 | Guia de uso, known issues e backlog V2 |

## Pós-MVP (não executar ainda)

F4-07/F4-08 foram transferidos para V2 por TASK-DOC-BE-001, mantendo IDs e significado. Revisões extensivas de cobertura além dos fluxos essenciais ficam em V2, sem remover testes existentes nem adiar segurança/integridade.

| ID | Funcionalidade |
|---|---|
| `V2-01` | Aprovação e revisão por clientes |
| `V2-02` | Upload, player e transcrição de mídia |
| `V2-03` | Integração/sincronização Google Calendar; exportação/importação ICS preserva IDs F4-07/F4-08 |
| `V2-04` | WhatsApp/push |
| `V2-05` | Equipes, papéis e colaboração |
| `V2-06` | Automação de postagem |
| `V2-07` | PWA offline instalável |
| `V2-08` | Analytics e relatórios avançados |

## Rastreabilidade TASK-BE-004

Implementação backend de F2-01 e F2-02 preparada para revisão: Project, migration,
seis endpoints `/projects`, DTOs, serviço, repository, OpenAPI e testes isolados.
Integração Neon e aplicação da migration de desenvolvimento permanecem pendentes;
nenhum gate remoto foi marcado como concluído. F2-03 e módulos associados fora
do escopo deste ticket.

## Rastreabilidade TASK-BE-005

Recorte backend F2-04/F2-05/F2-06/F2-07: notas independentes, zero ou um projeto,
tags, endpoints /notes, filtros, paginação, ownership e OpenAPI preparados para
revisão. Busca implementada por título; vínculos com eventos, buscas mais amplas
e telas continuam fora do ticket. Neon real/migration aplicada continuam pendentes;
não marcar gates remotos nem tickets completos sem revisão.

## Rastreabilidade TASK-BE-006

Recorte backend F2-09/F2-10/F2-12: Decupage e segmentos com DTOs, migration,
CRUD/arquivo/restauração, tags/filtros e reordenação transacional preparados para
revisão. Eventos, telas, upload e processamento de mídia fora do escopo. Integração
real Neon, constraints e concorrência no banco aguardam ambiente de desenvolvimento;
nenhum gate remoto ou ticket completo marcado sem revisão.

## Rastreabilidade TASK-BE-007

Recorte backend F3-01/F3-02/F3-03/F3-04: datas civis simples, Task/Subtask, migration,
CRUD/estados/checklist, ordenação, filtros/atraso, ownership e OpenAPI para revisão.
Recorrência, notificações, calendário, eventos e telas fora do ticket. Integração
Neon real/migration aplicada e gates remotos continuam pendentes; não marcar tickets
completos sem revisão.

## Rastreabilidade TASK-BE-008

Recorte backend F3-01/F3-09/F3-10/F3-11: engine civil limitada, regras versionadas,
estado/log de ocorrências, suspensão/retomada/fim, API e OpenAPI para revisão.
Sem RRULE complexa, eventos, notificações ou calendário visual. Integração Neon,
constraints/concorrência reais e gates remotos continuam pendentes; não marcar
etapas completas antes da revisão e validação autorizada.

## Rastreabilidade TASK-BE-009

Recorte backend F3-01/F3-06/F3-07/F3-09/F3-10/F3-12: Event, séries versionadas,
exceções individuais, engine civil reutilizada com resolução de horário local,
CRUD/filtros/overlap, auth/CSRF/ownership e OpenAPI preparados para revisão.
Sem telas, calendário agregado, notificações ou sincronização externa. Vínculos de
notas/decupagens a eventos são extensão futura fora deste ticket. Neon real,
constraints/concorrência e gates remotos continuam pendentes, sem marcação de
conclusão antes da revisão/validação autorizada.

## TASK-BE-010 — F3-13

GET /calendar agrega projeções de tarefas/eventos e ocorrências pela versão atual,
com auth/ownership, janela/paginação/limites e reutilização dos serviços existentes.
Sem persistência própria ou novo schema. Preparado para revisão; Neon real permanece
pendente. F3-14/F3-15, publicações e demais módulos fora do escopo.

## TASK-BE-011 — validação da Fase 3, recorte Code First

Revisão de BE-007/008/009/010 e migrations existentes, 20 novos testes isolados
e correção do formato de ano civil em localToday. Lint/typecheck, 318 testes
locais e build dry-run aprovados. Não houve mudança de schema/contrato ou migration
aplicada. Conforme decisão do mantenedor, Neon e runtime completo com banco não
foram executados; 13 testes externos continuam skipped. Não marcar o gate integrado
como concluído. Relatório e roteiro de execução futura em
[F3-BACKEND-NEON-VALIDATION.md](F3-BACKEND-NEON-VALIDATION.md).


## TASK-BE-012 — publicações editoriais, recorte Code First

F4-01/F4-02 preparados para revisão: ADR-004, Publication, migration aditiva,
seis endpoints /publications, DTOs, ownership/CSRF, filtros/paginação e OpenAPI.
Sem aplicação de migrations, credenciais Neon, postagem externa, aprovação, telas,
calendário ou notificações. Integração Neon/constraints e gates remotos pendentes;
não marcar tickets completos antes da revisão e validação autorizada.


## TASK-DOC-BE-001 — documentação central e continuidade

Escopo documental: PROJECT_STATUS, DEVELOPMENT_WORKFLOW, MVP_SCOPE e NEXT_STEPS;
referências antigas de monorepo, gates Code First e dependências de ICS corrigidas.
Backend BE-012 e frontend FE-015 estão incorporadas às mains inspecionadas; isso
não conclui integração editorial, Neon ou produção. Nenhum checkbox remoto foi
marcado e nenhum arquivo de implementação/migration foi alterado.

| Próximo ID | Parcela / rastreabilidade | Dependências | Estado no levantamento |
|---|---|---|---|
| TASK-BE-013 | Publicações no calendário, backend de F4-04 | BE-010/011/012 incorporadas | Incorporado na main (PR #15); Neon pendente |
| TASK-FE-016 | Integração HTTP editorial, F4-03 | FE-015 e BE-012 incorporadas | Planejado no repo frontend, não alterado por este PR |
| TASK-FE-017 | Publicações no calendário, frontend de F4-04 | BE-013 incorporada, FE-016, FE-013/014 | Planejado no repo frontend |

Dashboard, perfil, notificações, auditoria e validação mantêm IDs F4-05/06,
F1-08, F5-01–14 e F6 correspondentes, conforme NEXT_STEPS. Não reutilizar IDs de
tarefas já incorporadas nem criar numeração BE/FE nova sem conferir a fila.


## TASK-BE-013 — F4-04, parcela backend

Calendário suporta PUBLICATION explícito e combinações, preservando TASK,EVENT no
padrão. Projeção mínima por scheduledAt, sem duração/fallback, com status/plataforma/
projeto, ownership e recorte PostgreSQL limitado. Query, agregação, OpenAPI e testes
isolados preparados para revisão; sem schema/migration nova nem alteração frontend.
F4-04 completo ainda depende FE-017 e validação real. Não marcar gate Neon/remoto.


## TASK-BE-014 — F4-05, API operacional de dashboard

GET /dashboard implementado na branch feat/BE-014-dashboard-api a partir da main
0ac482d (BE-013 incorporada). Hoje, atraso limitado a 30 dias anteriores, próximas
tarefas/eventos/publicações em sete dias e indicadores com unidades documentadas.
Reutiliza coleta/motores do calendário, owner/fuso da sessão, COUNT Prisma e
limites explícitos; sem tabela/migration ou nova engine. Contrato OpenAPI e testes
isolados preparados para revisão. Frontend F4-06 depende da incorporação deste PR;
Neon real, custos SQL e aceite integrado permanecem pendentes. Não marcar gate remoto.


## TASK-BE-015 — F1-08, preferências essenciais

GET/PATCH /me/preferences implementados na branch feat/BE-015-user-preferences
sobre main cc16ef3 (BE-014 incorporada, PR #16). Nome/fuso/e-mail reutilizados e
resumo diário/HH:mm local adicionados à relação existente, com defaults e CHECK.
DTO, serviço, repository real transacional, auth/CSRF, OpenAPI e testes isolados
preparados para revisão; /auth/me preservado. Migration aditiva somente versionada,
sem aplicação, credenciais, e-mail, frontend ou deploy. F1-08 completo ainda depende
da interface e validação real; não marcar Neon nem gates remotos como aprovados.


## TASK-BE-016 — F5-01/F5-02, estrutura interna de notificações/outbox

Implementada na branch feat/BE-016-notification-outbox sobre main db63079 (BE-015
incorporada no PR #17). Três modelos, migration aditiva, DTOs/serviço/repositories
reais, idempotência, validação de origem/owner, leases/estados e logs transacionais.
Política O-09/O-10 e limites em NOTIFICATIONS-OUTBOX.md. Preparada para revisão;
sem migration aplicada, endpoint novo, hooks automáticos de CRUD, envio, Cron,
Queue ou frontend. F5-03 e processamento/resumo completos continuam pendentes;
Neon/constraints/concorrência real não foram validados.


## TASK-BE-017 — F5-03 e API mínima de regras

Implementada na branch feat/BE-017-domain-reminders, base main 013d49e (BE-016
incorporada no PR #18). Hooks transacionais nos scopes de tarefas/eventos/
publicações/recorrência e preferências, planejamento limitado, invalidação e
GET/PUT /reminders/{sourceType}/{sourceId}. Código preparado para revisão, não
aceite Neon. Sem migration, e-mail/Cron/Queue/consumer/frontend ou deploy.


## TASK-BE-018 — Cron/Queues (Code First, aguardando revisão)

Base main afccbe3, BE-017 incorporada. F5-06/F5-07 implementados em código;
F5-08 preparado sem provedor. Reserva com lock por usuário/CAS, lease técnico
recuperável só na publicação, payload mínimo, consumer com preflight e retry de
infraestrutura limitado/DLQ. Não marcar F0-09/F0-10 ou F5-14 remotos como aprovados.
567 testes/32 arquivos, lint/typecheck/build dry-run passaram; Neon/infra remota
não executados. Sem envio, migration nova, frontend ou deploy.
Detalhes, política e pendências: [CRON-QUEUES](CRON-QUEUES.md).

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
