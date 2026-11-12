# Feature template para o Codex

Ticket: `<ID>` — `<título>`
Repositório: `frontend` ou `backend`
Escopo: `<feature e arquivos esperados>`
Dependências cumpridas: `<IDs>`
Contrato/endpoint: `<arquivo OpenAPI ou documentação>`
Regras de negócio: `<trechos referenciados em REQUIREMENTS.md>`
Critérios de aceite: `<linha correspondente no BACKLOG.md + testes>`

## Entrega requerida
- Backend: DTOs Zod, rotas Express, serviços e repos, Prisma/migration, testes pertinentes e documentação contratual.
- Frontend: telas e hooks tipados, estados de loading/erro/vazio, validações de formulário, acessibilidade, testes e STYLE.md.
- Não assumir mudança do outro repositório: documentar dependência cruzada e propor issue separada.
- Abrir PR (ou deixar branch/changes prontos para PR quando a interface do Codex exigir confirmação). Nunca fazer merge.
