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
