# Projeto MAI — mai-backend

Repositório **backend** do Projeto MAI, aplicação web para organização da rotina de produção audiovisual e criação de conteúdo.

## Arquitetura

- **Frontend:** React + Vite + TypeScript, hospedado na **Vercel**.
- **Backend:** Express + TypeScript, hospedado no **Cloudflare Workers**.
- **Banco:** Neon PostgreSQL com Prisma no backend.
- **Jobs:** Cron Triggers + Transactional Outbox + Cloudflare Queues.
- **E-mail:** Gmail por adaptador (compatibilidade a validar).

Este repositório é **mai-backend**. Sua contraparte é outro repositório Git independente.

## Comece aqui

1. Leia `AGENTS.md` e `docs/REQUIREMENTS.md`.
2. Confira `docs/ROADMAP.md` e `docs/BACKLOG.md` antes de delegar tarefas.
3. Leia `docs/ARCHITECTURE.md`, `docs/API.md` e `docs/DECISIONS.md` antes de implementar.
4. Para desenvolvimento visual, siga `STYLE.md` (Montserrat em títulos, Inter em textos).
5. Use `COMMIT.md` para o commit de documentação e `README-CODEX-SETUP.md` para preparar o agente.

Os arquivos presentes são documentação e templates; **não substituem o código-fonte já existente**. Não realizar deploy, merge ou migrations em produção automaticamente.
