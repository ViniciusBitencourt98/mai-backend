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
- ADR-001: autenticação/sessão, proteção CSRF e contratos de identidade (F1-01).
- ADR-002: cardinalidade dos vínculos entre notas, eventos e projetos (F2-04).
- ADR-003: datas sem hora e regras de recorrência/exceções (F3-01).
- ADR-004: statuses do calendário editorial (F4-01).
- ADR-005: método Gmail após prova de conceito (F0-11).

O agente deve propor ADR em PR; não deve decidir silenciosamente mudanças de stack, infraestrutura paga ou mecanismos de acesso.
