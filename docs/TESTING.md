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
