# Backlog completo e rastreável — MVP

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
| `F0-02` | ☐ Inicializar monorepo com gerenciador de pacotes | F0-01 | apps/web, apps/api, packages/shared e scripts raiz funcionam |
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

## Fase 4 — Editorial, dashboard e exportação

| ID | Task | Dependências | Critério de aceite |
|---|---|---|---|
| `F4-01` | ☐ Fechar status mínimos e schema publications | F3-17 | ADR O-08 e migration publicados |
| `F4-02` | ☐ CRUD REST publications e filtros | F4-01 | DTOs e regras manuais; teste status e ownership |
| `F4-03` | ☐ UI lista, editor e filtros de publicações | F4-02 | Criar publicação e alterar status sem publicar externamente |
| `F4-04` | ☐ Exibir publicações na agenda unificada | F4-02,F3-15 | Calendário suporta filtro editorial e horário |
| `F4-05` | ☐ Construir endpoint agregador dashboard | F3-13,F4-02 | Hoje, vencidas, próximos eventos/publicações por fuso |
| `F4-06` | ☐ Construir dashboard com ações rápidas | F4-05,F2-08,F3-05 | Usuária vê dia e inicia tarefa/nota rapidamente |
| `F4-07` | ☐ Implementar gerador RFC5545 de arquivo ICS | F3-12 | UID, escapas, timezones e RRULE testados |
| `F4-08` | ☐ Criar endpoint/export UI para eventos ICS | F4-07 | Baixar ICS importável; explica ausência de sync |
| `F4-09` | ☐ Testar E2E editorial/dashboard/export | F4-03,F4-04,F4-06,F4-08 | Agenda mostra publicação, ICS valida e dashboard correto |

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
| `F6-08` | ☐ Executar smoke em produção com conta de teste | F6-07 | Criar nota/tarefa, evento, exportar ICS e enviar teste |
| `F6-09` | ☐ Testar quotas gratuitas e documentar custo | F6-07 | Limites/risco de suspensão registrados, sem surpresas |
| `F6-10` | ☐ Validar UX com usuária no celular | F6-08 | Jornadas reais testadas, observações registradas |
| `F6-11` | ☐ Corrigir blockers do teste e congelar MVP | F6-10 | Falhas críticas resolvidas; aceite assinado/informal |
| `F6-12` | ☐ Publicar manual rápido e lista pós-MVP | F6-11 | Guia de uso, known issues e backlog V2 |

## Pós-MVP (não executar ainda)

| ID | Funcionalidade |
|---|---|
| `V2-01` | Aprovação e revisão por clientes |
| `V2-02` | Upload, player e transcrição de mídia |
| `V2-03` | Sincronização Google Calendar em duas vias |
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
