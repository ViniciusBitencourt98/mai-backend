# AGENTS.md — Projeto MAI (backend)

## Leitura obrigatória
Leia antes de modificar código: `README.md`, `README-CODEX-SETUP.md`, `docs/REPO_NOTES.md`, `docs/REQUIREMENTS.md`, `docs/BACKLOG.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/API.md`, `docs/DECISIONS.md`, `docs/TESTING.md`. Em UI, leia `STYLE.md`.

## Escopo e stack imutáveis
- Repositório atual: **backend**, separado do outro repositório do projeto MAI.
- Frontend React + Vite + TypeScript hospedado na **Vercel**; backend Express + TypeScript hospedado em **Cloudflare Workers**.
- PostgreSQL Neon + Prisma; DTOs Zod; cron + transaction_outbox + Cloudflare Queues; sem BullMQ/Redis.
- E-mails por Gmail via adaptador, sem retentativa automática de envio no MVP. Exportação Google Calendar apenas `.ics`.
- Nunca converter Express para Hono/Next sem aprovação do mantenedor.

## Fluxo de execução para Codex
1. Trabalhar **somente** na tarefa informada por ID em `docs/BACKLOG.md`; verificar dependências e código existente. Não executar tickets futuros automaticamente.
2. Descrever plano sucinto, implementar o necessário e atualizar testes/docs. Seguir `docs/prompts/FEATURE_TEMPLATE.md`.
3. Sempre verificar lint, typecheck, testes e build. Não alegar execução de checks não rodados; registrar bloqueios reais.
4. Criar branch `codex/<ID>-<slug>` e preparar PR apontado para a branch principal, se ambiente/permissões permitirem. Não presumir que o agente tem permissão para abrir PR automaticamente. Se a UI exigir publicação manual, preparar a alteração e pedir somente a ação final de criação do PR.
5. Incluir no PR: ticket, escopo, arquivos modificados, endpoints/migrations, testes, riscos, screenshots se UI, dependências entre repos.
6. **Nunca fazer merge, force push na main, liberar deploy produção nem aplicar migrations no banco de produção.**
7. Não criar serviços pagos, publicar dados de usuário, alterar segredos, mudar ambiente de produção ou introduzir permissões ampliadas sem aprovação humana.
8. Nunca registrar credenciais em código, markdown, outputs, snapshots ou testes.

## Regras de domínio essenciais
- Tarefas são concluíveis; eventos são compromissos; ambas aparecem na agenda junto com publicações.
- Notas e decupagens são independentes e podem ficar sem vínculos a projeto/evento.
- Vínculo e leitura devem validar usuário proprietário.
- Recorrência deve preservar estado por ocorrência, respeitar fuso e evitar geração infinita.
- Outbox deve persistir com a transação de negócio; filas entregam pelo menos uma vez, implementar idempotência.

## Regras específicas — backend
- Express deve funcionar em Workers sem `app.listen()` persistente; usar integração documentada e PoC remota.
- Definir serviço/repositório desacoplado da camada HTTP; validar dados com Zod; usuários não vêm do body.
- Prisma e driver compatíveis com Workers; nunca assumir que bibliotecas Node funcionarão sem PoC.
- Migrations só em ambiente de desenvolvimento/teste autorizado; produção somente após aprovação.
- Segredos via bindings/secrets; CORS estrito e logs seguros.

## Code Review Rules
- Rejeitar vazamento de segredos, bypass de autenticação/ownership, migrations destrutivas sem aprovação, escopo expandido e deploy de produção implícito.
- Pautar comentários em bugs reproduzíveis, segurança e critérios de aceite do ticket.
