# Estratégia mínima de testes

- `lint`: sem erros; `typecheck`: TS estrito; `test`: unitário e integração pertinentes; `build`: sucesso.
- Backend: testar contratos HTTP, Zod, autorização por usuário, repository/service; em PoCs, smoke remoto Workers/Neon quando credenciais permitirem.
- Frontend: estados loading/erro/vazio, navegação e formulários; teste de integração com API mockada; E2E em fluxos críticos quando introduzidos.
- CI só é verde se comandos executados tiverem passado; não mascarar ausência de scripts/testes.
- Cobertura e status de execução devem constar no PR. Testes que dependam de segredos ou serviços pagos não são mandatórios em PRs de fork; indicar testes manuais e ambientes.
- Migrations: verificar diff, risco de dados e rollback antes de aplicar em produção.
- Nunca usar credenciais reais em logs, fixtures ou reports.
