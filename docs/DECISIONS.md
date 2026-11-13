# Decisões técnicas — registro de ADRs

## Decisões fechadas
- Frontend: React, Vite e TypeScript, repositório independente.
- Backend: Express, TypeScript e Cloudflare Workers, repositório independente.
- Banco: Neon PostgreSQL e Prisma com adapter compatível com Workers.
- Agendamento: Cloudflare Cron Triggers, Transactional Outbox e Cloudflare Queues.
- Entrega de e-mail: Gmail (API HTTP ou SMTP após PoC), falhas tratadas manualmente no MVP.
- Anotações/decupagens não exigem vínculos com projeto/evento.
- Exportação ICS é unidirecional, não sincronização Google Calendar.

## Decisões pendentes (bloqueiam tickets dependentes, não todo o projeto)
- ADR-001: proposta implementada para revisão no PR F1-01–F1-04: [sessões opacas, PBKDF2 e CSRF](ADR-001-AUTHENTICATION.md). A aprovação final cabe ao mantenedor.
- ADR-002: cardinalidade dos vínculos entre notas, eventos e projetos (F2-04).
- ADR-003: datas sem hora e regras de recorrência/exceções (F3-01).
- ADR-004: statuses do calendário editorial (F4-01).
- ADR-005: método Gmail após prova de conceito (F0-11).

O agente deve propor ADR em PR; não deve decidir silenciosamente mudanças de stack, infraestrutura paga ou mecanismos de acesso.

## TASK-BE-004 — contrato de projetos para revisão

- Estados ACTIVE/ARCHIVED, alinhados a RF-07. Arquivar/restaurar é idempotente;
  PATCH de status usa a mesma regra, mantendo status e archivedAt consistentes.
- Datas são civis PostgreSQL DATE e JSON YYYY-MM-DD, sem conversão de fuso.
- Rotas `/projects` seguem o ticket explícito; sem DELETE no MVP.
- Paginação offset limitada, ordenação estável por campo + UUID; filtro de status
  não sobrepõe includeArchived=false. Ver exemplos no OpenAPI.
- Consultas e mutações Prisma incluem ownerId. Recursos de outra conta e ausentes
  recebem 404 idêntico; CSRF reutiliza os middlewares da autenticação.
- Conforme autorização do ticket, pendências de Neon/PoC remota não bloquearam
  implementação local. Isso não conclui os gates remotos de F0/F1.
