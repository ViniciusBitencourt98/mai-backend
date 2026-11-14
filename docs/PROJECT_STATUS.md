# Estado do Projeto MAI

Levantamento de TASK-DOC-BE-001 em 2026-11-14. Este documento descreve o código
observado, não certifica operação em produção. Atualizar junto de cada entrega que
mude o estado; escopo em [MVP_SCOPE](MVP_SCOPE.md), sequência em
[NEXT_STEPS](NEXT_STEPS.md) e regras em [DEVELOPMENT_WORKFLOW](DEVELOPMENT_WORKFLOW.md).

## Atualização BE-014 (branch de implementação)

Base main `0ac482d`: BE-013 incorporada pelo PR #15. A branch
`feat/BE-014-dashboard-api` implementa GET /dashboard, aguardando revisão/merge.
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
