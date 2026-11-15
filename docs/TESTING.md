# Estratégia mínima de testes

- `lint`: sem erros; `typecheck`: TS estrito; `test`: unitário e integração pertinentes; `build`: sucesso.
- Backend: testar contratos HTTP, Zod, autorização por usuário, repository/service; em PoCs, smoke remoto Workers/Neon quando credenciais permitirem.
- Frontend: estados loading/erro/vazio, navegação e formulários; teste de integração com API mockada; E2E em fluxos críticos quando introduzidos.
- CI só é verde se comandos executados tiverem passado; não mascarar ausência de scripts/testes.
- Cobertura e status de execução devem constar no PR. Testes que dependam de segredos ou serviços pagos não são mandatórios em PRs de fork; indicar testes manuais e ambientes.
- Migrations: verificar diff, risco de dados e rollback antes de aplicar em produção.
- Nunca usar credenciais reais em logs, fixtures ou reports.

## TASK-BE-004 — projetos

`tests/projects/projects.test.ts` contém 28 testes isolados (DTO, serviço, HTTP e
predicados Prisma com persistência fake/mock). Não são testes de integração Neon.
A suíte completa executou 133 testes com sucesso, incluindo workerd local.
Lint e typecheck passaram. O build dry-run passou com
`XDG_CONFIG_HOME=/workspace/.config WRANGLER_SEND_METRICS=false npm run build`;
a configuração XDG evita escrita fora do workspace no ambiente Codex.
Smoke Wrangler local: `/health` 200 e `/projects` sem sessão 401.

`npm run test:integration` identificou 4 testes skipped em 2 arquivos: os 3 testes
Neon existentes e o teste real de projetos. Não houve conexão PostgreSQL nem
aplicação de migration. O novo teste real valida persistência por outro client,
atualização, isolamento, arquivamento/restauração, filtros e paginação. Para rodar,
configure as URLs de **desenvolvimento** e MAI_DATABASE_ENV conforme o roteiro
Prisma/Neon, e aplique as migrations somente nesse banco autorizado. O teste cria
e remove somente registros sintéticos com UUIDs próprios, sem migrations automáticas.

Nesta execução `npm ci` encontrou 403 no checksum do CDN Prisma. O client foi
regenerado pelas APIs oficiais com pacotes npm 7.10.1 conforme a alternativa já
descrita em PRISMA-NEON-LOCAL.md, sem editar gerados ou desativar TLS/checksum.
O CLI padrão e a execução real em Neon/remoto permanecem pendentes. Nenhum deploy.

## TASK-BE-005 — anotações

29 testes isolados em tests/notes/notes.test.ts: DTOs, criação independente/vinculada,
projeto inválido/externo, conteúdo/tags/desvinculação, filtros/páginas, arquivo e
restauração, autenticação/CSRF/CORS, isolamento HTTP e predicados Prisma com mock.
Não representam PostgreSQL real. A suíte completa passou: 162 testes em 14 arquivos;
lint/typecheck e build dry-run aprovados (XDG_CONFIG_HOME=/workspace/.config,
WRANGLER_SEND_METRICS=false). Nenhuma dependência nova.

A execução de test:integration identificou 5 skipped em 3 arquivos por ausência
das URLs Neon de desenvolvimento. O novo notes.integration.ts usa banco real,
sem mocks, para persistência, tags/filtros, arquivo/restauração, vínculo opcional e
FK composta rejeitando projeto de outro proprietário. Não aplica migrations e
limpa somente registros sintéticos próprios. Usar o fluxo autorizado de banco de
desenvolvimento do roteiro Prisma/Neon para executar; nunca produção.
Client regenerado com APIs oficiais Prisma 7.10.1 conforme a alternativa já
documentada em PRISMA-NEON-LOCAL.md; sem desativar TLS/checksum ou editar gerados.
Neon e Cloudflare remoto continuam pendentes. Nenhuma migration aplicada/deploy.

## TASK-BE-006 — decupagens

39 testes isolados: CRUD/validações do pai, vínculo opcional/externo, filtros e
paginação, auth/CSRF/CORS, segmentos, limites de timecode e coleção, merge de
edição, remoção/compactação, permutação exata, preservação ao arquivar e predicados
Prisma/ordem do bloqueio em transação mockada. Não comprovam PostgreSQL real.
A suíte completa executou 201 testes em 15 arquivos, com lint/typecheck e build
dry-run aprovados (XDG_CONFIG_HOME=/workspace/.config, WRANGLER_SEND_METRICS=false).

`test:integration`: 7 skipped em 4 arquivos sem URLs Neon de desenvolvimento.
Os 2 novos testes reais em decupages.integration.ts (sem mocks) cobrem persistência,
reordenação com swaps, rollback de operações inválidas, CHECK de timecode e
adições concorrentes por clients separados. Constraints/migration e concorrência
real continuam pendentes; não declarar mocks como validação dessas garantias.
Aplique migrations separadamente somente em banco de desenvolvimento autorizado.
O teste limpa apenas registros sintéticos próprios. Sem migration/deploy remoto.
Client gerado por APIs oficiais Prisma 7.10.1 conforme roteiro já documentado,
sem editar gerados ou desativar TLS/checksum; dependências/lockfile inalterados.

## TASK-BE-007 — tarefas e subtarefas

37 testes isolados em tests/tasks/tasks.test.ts cobrem criação/validação, projeto
opcional/externo, datas mescladas, prioridades, transições/conclusão/reabertura,
completedAt idempotente, filtros/paginação/atraso no fuso, nulos no fim, checklist,
reordenação/remoção, limites e isolamento. HTTP testa auth/CSRF em todos os 14
endpoints. Mocks de Prisma verificam predicados, lock anterior à leitura e whitelist
de colunas; não comprovam persistência ou rollback PostgreSQL real.

Suíte completa: 238 testes aprovados em 16 arquivos; lint, typecheck e build dry-run
aprovados (XDG_CONFIG_HOME=/workspace/.config, WRANGLER_SEND_METRICS=false).
`test:integration`: 9 skipped em 5 arquivos por ausência das URLs Neon. Os 2 novos
testes reais em tasks.integration.ts cobrem persistência, completedAt/CHECKs, FK de
projeto, reorder/rollback, atraso e operações concorrentes por clients separados.
Sem mocks nesses testes, sem aplicação automática de migrations, cleanup somente
de registros sintéticos próprios. Aguardar banco de desenvolvimento autorizado
para validar os CHECKs, UNIQUE adiada e concorrência; produção fora do escopo.
Client gerado com APIs oficiais Prisma 7.10.1 conforme o roteiro já documentado,
sem editar gerados/desativar TLS ou checksum. Sem dependências/lockfile alterados.

## TASK-BE-008 — recorrência de tarefas

21 testes isolados em tests/recurrence/recurrence.test.ts, com relógio controlado:
diária/semanal/mensal/customizada, intervalos/count/término, clamp 29/30/31,
bissexto/exceção secular, DST/fusos sem horário, limites/validação, paginação,
próxima data no fuso, conclusão individual/idempotência/log, versões/histórico,
suspensão/retomada/fim, arquivo, ownership/auth/CSRF e bloqueio com Prisma mockado.
Não comprovam persistência ou concorrência real em PostgreSQL.

Suite completa: 259 testes aprovados em 17 arquivos; lint/typecheck e build dry-run
aprovados com XDG_CONFIG_HOME=/workspace/.config, WRANGLER_SEND_METRICS=false.
`test:integration`: 11 skipped em 6 arquivos por falta das URLs de desenvolvimento.
Os 2 novos testes reais em recurrence.integration.ts cobrem persistência versionada,
estados esparsos, histórico, propriedade e conclusão concorrente por clients distintos
com uma linha de estado e um evento. Sem mocks ou migrations automáticas; cleanup
somente dos dados sintéticos próprios. Constraints/concorrência real e Neon seguem
pendentes. Nenhuma migration aplicada, deploy ou merge executado.
Prisma Client gerado pelas APIs oficiais 7.10.1 conforme procedimento já documentado,
sem editar gerados, alterar lockfile/dependências ou desativar TLS/checksum.

## TASK-BE-009 — eventos e recorrência

23 testes isolados em tests/events/events.test.ts, datas e relógio determinísticos:
DTOs/intervalos, projeto opcional/externo, CRUD/arquivo, pesquisa/paginação e overlap
incluindo atravessar limites; quatro frequências pelo calendário compartilhado;
DST gap/fold (incluindo Lord Howe), clamp bissexto, edição/movimento/cancelamento/
restauração individual, idempotência, versões/suspensão/fim e auth/CSRF/ownership
nos 16 endpoints. Mock Prisma verifica overlap, limite e bloqueio antes de ler
séries; isso não comprova PostgreSQL real.

Suíte completa: 282 testes aprovados em 18 arquivos, lint/typecheck/build dry-run
aprovados (XDG_CONFIG_HOME=/workspace/.config, WRANGLER_SEND_METRICS=false).
`test:integration`: 13 skipped em 7 arquivos sem URLs Neon de desenvolvimento.
Os 2 novos testes reais em events.integration.ts cobrem instantes UTC, overlap,
FK/CHECK, séries/exceções e cancelamento concorrente com uma única linha. Sem mocks
nesses testes, sem migrations automáticas, cleanup apenas de dados sintéticos próprios.
Constraints/concorrência real e Neon permanecem pendentes; nenhuma migration,
merge ou deploy realizado. Client gerado pelas APIs oficiais Prisma 7.10.1 conforme
procedimento já documentado, sem editar gerados/desativar TLS/checksum. Dependências
e lockfile inalterados.

A revisão de BE-009 adicionou regressão para updatedAt de ocorrências calculadas
após editar o mestre; exceções salvas preservam seu próprio snapshot/timestamp.

## TASK-BE-010 — calendário agregado

16 testes isolados em tests/calendar/calendar.test.ts: query estrita, paginação,
projeções pontuais/recorrentes, overlap no repository, modified/cancelled, timezone,
combinação de tipos, vazios/séries inativas, ownership/auth HTTP, repetição de query,
limites de mestres e expansão global. As expansões são dependências isoladas nos
testes de agregação; testes de calendário civil/DST e exceções reais dos serviços
permanecem nas suítes BE-008/009 e são executados junto. Não são testes PostgreSQL.

Suíte total: 298 testes em 19 arquivos. Neon: 13 testes externos skipped em 7 arquivos
sem URLs de desenvolvimento. Nenhum teste simulado é apresentado como integração
real. Lint/typecheck/test/build dry-run executados; sem migrations ou schema novo.

## TASK-BE-011 — revisão Code First da Fase 3

Por decisão explícita do mantenedor, nenhum acesso a banco ou migration nesta
execução. Suíte local: 318 testes aprovados em 21 arquivos (20 novos), zero skips;
lint/typecheck/build dry-run aprovados. Os 13 testes Neon em 7 arquivos permanecem
skipped, com zero casos externos executados. Não se trata de aprovação integrada.

Os novos testes de calendário compõem os serviços reais de recorrência com
persistência isolada: exceções movidas, cancelamentos, conclusão individual,
PAUSED/ENDED, versões, ownership, timezone/DST e paginação. Limites exatos de
31 dias, 100 mestres por tipo e 10.000 itens também são verificados. A regressão
de anos 0001/0099/0999 reproduziu a perda de zeros em localToday antes da correção.
Mocks Prisma verificam propagação de falha dentro das transações de ocorrência,
versão/exceção e reordenação; rollback PostgreSQL continua pendente.

Inventário dos 13 testes, cobertura, diferenças de contrato, migrations revisadas
e sequência de execução local em
[F3-BACKEND-NEON-VALIDATION.md](F3-BACKEND-NEON-VALIDATION.md).

## TASK-BE-012 — publicações editoriais

74 testes isolados em tests/publications/publications.test.ts: criação/edição,
seis plataformas, oito formatos, seis estados manuais, datas com offset/UTC e
limites, publishedAt preservado nas edições/status/arquivo e removido só por null
explícito; projeto opcional próprio, desvinculação, arquivo/restauração idempotentes,
filtros AND, intervalo planejado [from,to), nulls no fim, paginação, entrada estrita,
ownerId somente da sessão, autenticação nos seis endpoints, CSRF/Origin em todas
as mutações, CORS com credenciais, limite de corpo e mídia JSON. Mocks Prisma
verificam os predicados reais, escopo ownerId, ordenação, filtros/escape de pesquisa,
paginação, timestamps de arquivo condicionais e mapeamento de FK. Não comprovam
persistência, concorrência nem constraints PostgreSQL.

Validação nesta entrega: lint e typecheck passaram; 392 testes em 22 arquivos
passaram, zero skips na suíte local (inclui workerd). Build Wrangler dry-run passou,
sem upload. Smoke em workerd local: GET /publications sem sessão retorna 401.
OpenAPI 3.1 validado para os seis endpoints e schemas referenciados; dez exemplos
de request/response validados com JSON Schema e formatos.

A validação do documento OpenAPI completo detectou respostas antigas de /decupages
sem description obrigatória (defeito preexistente, fora do módulo editorial).
Os novos endpoints não têm esse erro; correção do contrato legado fica pendente,
sem alteração no comportamento/contratos dos outros módulos nesta tarefa.

Prisma Client regenerado pelas APIs oficiais in-process 7.10.1, conforme
PRISMA-NEON-LOCAL.md. A geração CLI padrão ainda falha com 403 no checksum de
binaries.prisma.sh; nenhum checksum/TLS foi desativado. Dependências e lockfile
inalterados. Migration 20261114000100_publications apenas versionada, não aplicada.

Integração Neon de publicações permanece pendente: criar/ler por clients separados,
valores de enums, FK composta rejeitando projeto externo, filtros PostgreSQL,
ordenação de nulos/paginação, datas e arquivo concorrente. Os 13 testes externos
existentes não foram executados nesta tarefa. Não houve solicitação de credenciais,
migration em banco real, bootstrap, deploy ou postagem em rede social. Mocks não
substituem a validação integrada futura e /calendar não foi modificado.


## TASK-BE-013 — publicações no calendário

38 testes novos em tests/calendar/publications.test.ts, com query estrita,
combinações/permutação dos três tipos e padrão omitido TASK,EVENT preservado.
O serviço e repository Prisma reais compõem uma fronteira de banco simulada:
instante planejado/sem data (sem fallback publishedAt), arquivo/cancelamento,
janela [from,to), limites exatos/milissegundos, projeto opcional, proprietário,
projeção mínima/identidade, fusos e transição DST, ordenação/desempates/paginação
combinados, seleção de repositories e sentinela de excesso. Teste HTTP Express
com sessão isolada exige autenticação, deriva owner da sessão, rejeita ownerId e
queries repetidas, verifica CORS com credenciais e no-store. A simulação da fronteira
não comprova execução das queries em PostgreSQL.

O teste de orçamento mantém 10.000 ocorrências de eventos canceladas (contadas
antes de ocultar) e verifica que adicionar publicação excede o limite. Até 100
publicações datadas são aceitas; 101 retornam CALENDAR_LIMIT antes de paginar,
mesmo com limit=1. As suítes anteriores de calendário/composição apenas ganharam
uma dependência publications vazia para atender a interface; asserções anteriores
preservadas. Todos os motores/regras de recorrência existentes continuam exercitados.

| Comando/check | Resultado desta entrega |
|---|---|
| npm run lint | Passou |
| npm run typecheck | Passou |
| npm test | 430 passaram em 23 arquivos, zero skips na suíte local; inclui workerd |
| npm run build | Passou, Wrangler dry-run sem upload |
| OpenAPI 3.1, recorte /calendar e schemas referenciados | Passou; exemplo editorial validado contra CalendarPage |
| Compatibilidade do contrato | CalendarTask/CalendarEvent e default TASK,EVENT idênticos à base |
| git diff --check | Passou |

Sem alteração de schema/lockfile/CRUD/editorial/auth, sem nova tabela/migration.
A consulta recorta owner/arquivo/status/janela no Prisma, seleciona apenas seis
campos e take=101; índices existentes são compatíveis com o predicado. O plano
real, persistência/isolamento e combinação com recorrências sob concorrência
continuam pendentes de Neon de desenvolvimento, na máquina do desenvolvedor.
Não houve solicitação de credenciais, execução dos 13 testes externos existentes,
migration real, deploy ou modificação frontend. O defeito legado do OpenAPI global
de decupagens registrado na BE-012 continua fora do escopo.

## TASK-BE-014 — dashboard operacional

21 testes novos em tests/dashboard/dashboard.test.ts e composition.test.ts.
Testes isolados compõem DashboardService/CalendarService reais; a suíte de
composição usa também RecurrenceService/EventService e os motores existentes,
com persistência isolada. Cobrem vazio, dia/fuso da sessão, tarefas civis,
atrasadas/concluídas/futuras, ocorrências sem duplicação do mestre, eventos
atravessando meia-noite, recorrência/cancelamento/exceção movida, publicações
planejadas/arquivadas/canceladas/PUBLISHED/sem data, limites temporais exclusivos,
ordenação e corte independente de listas com contagens anteriores ao corte.

DST de Nova York (dias de 23 e 25 horas), meia-noite suprimida em São Paulo e dia
inteiro inexistente em Apia exercitam os limites civis. Testes HTTP Express com
sessão isolada exigem autenticação, owner/fuso da sessão, query estrita (inclusive
repetidos/injeção de ownerId/timezone), CORS com credenciais, GET-only no preflight
e Cache-Control no-store. Count Prisma mockado verifica o escopo global por
proprietário/arquivo/status sem leitura de linhas; falhas são propagadas, não zeros.

Limites de fonte do calendário e soma combinada do dashboard são exercitados,
sem resposta parcial. A comparação collect/list verifica preservação da paginação
original. Suítes anteriores, inclusive BE-013, permanecem executadas.

| Verificação | Resultado nesta entrega |
|---|---|
| npm run lint | Passou |
| npm run typecheck | Passou |
| npm test | 451 passaram em 25 arquivos, zero skips locais; inclui workerd |
| npm run build | Passou, Wrangler dry-run sem upload |
| OpenAPI 3.1, recorte /dashboard e schemas referenciados | Passou |
| Exemplo completo de Dashboard contra JSON Schema/formats | Passou |
| Contratos existentes | Todos os paths/schemas OpenAPI anteriores idênticos à main de base |
| git diff --check e links Markdown alterados | Conferidos |

Atrasos/contagem são limitados à janela de 30 dias anteriores, próximos itens a
sete dias após a data selecionada; pendingTasks é global por mestre, não por
ocorrência. Essa distinção é contrato, não truncamento silencioso. Os limites
podem gerar CALENDAR_LIMIT/DASHBOARD_LIMIT em bases grandes; explorar os endpoints
de domínio com janelas menores. Não há snapshot global entre coletas/count/scopes.

Neon real, custo/plano SQL de COUNT/consultas, constraints e concorrência do resumo
permanecem pendentes na máquina do desenvolvedor. Nenhum teste simulado comprova
PostgreSQL. Os 13 casos externos existentes não foram executados, nenhuma credencial
foi solicitada e não houve migrations, deploy, frontend ou envio de e-mail.
A limitação legada do OpenAPI global de decupagens continua fora do escopo.

## TASK-BE-015 — perfil e preferências essenciais

47 testes novos em tests/preferences/preferences.test.ts: leitura/defaults,
edição parcial de nome/fuso, fuso inválido, booleanos estritos, ativação/desativação
de e-mail/resumo independentes, preservação do horário ao desativar, HH:mm válido/
inválido, null e campos extras/injeção rejeitados, preservação de outra conta,
conta ausente/desativada, sessão revogada, auth/Origin/CSRF, mídia e tamanho de corpo,
query estrita, CORS/preflight/no-store e leitura subsequente de /auth/me sem re-login.

Persistência é simulada apenas nos testes. As asserções Prisma verificam seleção
pública mínima, escopo userId/disabledAt, GET sem escrita/defaults, bloqueio por
UPDATE anterior ao upsert, campos parciais, revalidação da conta e propagação de
falha dentro da transação. Não comprovam rollback/concorrência PostgreSQL reais.
O teste de autenticação confirma a seleção antiga timezone/emailEnabled, sem
novos campos de resumo no DTO de /auth/me. A suíte HTTP usa AuthService e mecanismos de sessão do código de produção
com repository fake, não um login persistido no Neon.

| Verificação | Resultado nesta entrega |
|---|---|
| npm run lint | Passou |
| npm run typecheck | Passou |
| npm test | 498 passaram em 26 arquivos, zero skips na suíte local; inclui workerd |
| npm run build | Passou, Wrangler dry-run sem upload |
| OpenAPI 3.1, recorte /me/preferences e schemas referenciados | Passou; três exemplos validados com JSON Schema/formats |
| Contratos existentes | Paths/schemas OpenAPI anteriores preservados, inclusive /auth/me |
| git diff --check / links Markdown alterados | Conferidos |

Client Prisma regenerado pelas APIs oficiais in-process 7.10.1 conforme o
procedimento existente em PRISMA-NEON-LOCAL.md; CLI padrão não revalidado neste
ticket, diante da limitação de CDN registrada anteriormente. Nenhuma verificação
de TLS/checksum desativada e nenhuma alteração de dependências/lockfile.

Migration 20261115000100_user_preferences apenas versionada. Permanecem pendentes:
execução da migration/defaults/CHECK em Neon de desenvolvimento, criação da relação
por upsert, concorrência de PATCHs parciais/disable e rollback de nome+preferências,
sessão e consumo de fuso reais. Os 13 casos externos existentes não foram executados;
nenhuma credencial solicitada, migration aplicada, mensagem enviada, Cron/Queue,
frontend, merge ou deploy. O defeito legado do OpenAPI global de decupagens segue
fora do escopo; a validação registrada é do novo recorte.
