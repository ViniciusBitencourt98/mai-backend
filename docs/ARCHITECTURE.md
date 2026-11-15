# Arquitetura técnica — MVP

## Decisão de stack (não substituir sem aprovação)

- Repositório `mai-frontend`: React + Vite + TypeScript + Tailwind, hospedado na **Vercel** (validar elegibilidade ao plano gratuito para uso profissional).
- Repositório `mai-backend`: **Express + TypeScript** rodando em **Cloudflare Workers**, com organização em módulos/rotas/controllers/services/repositories.
- Contratos REST versionados no backend (`docs/API.md` e OpenAPI quando implementado), consumidos no frontend; **sem pacote compartilhado por caminho local entre repositórios**.
- Schema Prisma, migrations e client ficam **somente no repositório backend**.
- Persistência: PostgreSQL Neon. Mensageria: Cloudflare Queues. Scheduler: Cloudflare Cron. E-mail: Gmail via adaptador.
- **Não migrar silenciosamente para Hono, NestJS, Next backend, Redis ou BullMQ.**

## Condição técnica obrigatória (PoC da fase 0)

A Cloudflare mantém tutorial oficial de **Express em Workers**: https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/ . Compatibilidade de Node depende da `compatibility_date` e de módulos usados: https://developers.cloudflare.com/workers/configuration/compatibility-flags/ . A validação deve usar build + deploy de verdade, não só execução local. Para datas atuais, verificar flags recomendadas — não copiar cegamente tutoriais antigos.

**Política vigente (TASK-DOC-BE-001):** implementar Code First preservando esta
stack, sem exigir credenciais Neon nos agentes. A validação real Express/Workers →
Prisma → Neon, Cron/Queues e e-mail permanece necessária e pendente; não é
comprovada por mocks. O gate remoto original não impede recortes de código com
testes isolados. Validar os fluxos essenciais localmente na máquina do desenvolvedor
e publicar somente mediante ação explícita posterior do mantenedor. Ver
[workflow](DEVELOPMENT_WORKFLOW.md) e [estado](PROJECT_STATUS.md).

## Visão de componentes

```
React SPA (Vercel)
   | HTTPS REST + sessão segura
   v
Express HTTP (Worker API) -----> Prisma compatível -----> Neon PostgreSQL
   |                                       |                  |
   |                              alteração de domínio + outbox (1 tx)
   |                                                          |
Cron Trigger / dispatcher Worker <----- SELECT devidos + lease <---|
   | publish IDs
   v
Cloudflare Queue ---> Consumer Worker ---> Gmail API ou SMTP validado
                           |
                         UPDATE outbox / log de envio
```

Implementar dispatcher e consumer como entrypoints separados (Workers ou handlers exportados conforme configuração). Não iniciar cron infinito, setInterval persistente ou processo Redis no worker web.

## Organização de repositórios independentes

O projeto usa **dois repositórios**. Não criar `apps/web`, `apps/api` ou monorepo.

**mai-frontend:** `src/` (rotas, componentes, features, API client e estilos), `public/`, `docs/`, `AGENTS.md`, `STYLE.md`. Deploy Vercel.

**mai-backend:** `src/` (app Express, módulos, middlewares, infra, consumers e agendamentos), `prisma/`, `docs/`, `AGENTS.md`. Deploy Cloudflare Workers.

O contrato é HTTP/OpenAPI; não usar importações relativas entre dois repositórios distintos.

## Organização do backend

- **Routes/Controller**: extrair entrada HTTP, aplicar middleware de auth, validar DTO Zod, retornar HTTP codes, sem consultas SQL dispersas.
- **Service**: regras de negócio, permissões e transações, cancelamento/reagendamento e outbox.
- **Repository**: queries Prisma, filtros/paginação, tenant scoping.
- **Infra**: Prisma client/factory, auth, e-mail adapter, Clock, fila, logger, observabilidade.
- **DTO**: request/response imutável via contratos Zod; `PATCH` parcial, sem confundir ausência com `null` (remoção de vínculo).

## Autenticação e isolamento

Decidir provedor/método na primeira fase (documentar em `DECISIONS.md`). Preferir sessão/cookie seguro e proteção CSRF onde aplicável; CORS restrito aos domínios permitidos. `user_id` vem da sessão, **nunca** do corpo em criação. Verificação de propriedade de ID estrangeiro antes da associação. Segredos por bindings/secrets; logs sem tokens, conteúdo privado ou payloads sensíveis.

## Recorrência e calendários

Usar modelo explícito `recurrence_rule` com timezone e tabela de exceções/overrides. Expandir ocorrências **em uma janela solicitada** com limites de quantidade. Mudanças da série devem invalidar lembretes afetados. Separar instantes (UTC) de datas locais e timecodes de vídeo. ICS e integração Google Calendar ficam em V2 (MVP_SCOPE); eventual exportação não é sync. Decisões de RFC 5545 ficam para o ticket futuro.

## Transactional Outbox

1. Na mesma transação PostgreSQL: salvar alteração do domínio e evento/outbox de notificação agendada com chave de idempotência e `scheduled_at`.
2. Cron executa a varredura de registros vencidos; reserva pequena quantidade com concorrência segura (`FOR UPDATE SKIP LOCKED` ou padrão equivalente), lease e marca publicação.
3. Publica identificador da outbox (não segredo nem corpo privado completo) em Queues; marca `PUBLISHED` após aceite; se publicar e falhar ao atualizar, possível duplicação é aceitável desde que tratada de forma idempotente.
4. Consumer carrega registro, valida versão e vigência do evento/tarefa/publicação, verifica `sent_at`; envia e-mail e marca `SENT` (aceito pelo provedor), `FAILED` em falha operacional, ou `CANCELLED` para obsoleto.
5. **MVP sem retentativas automáticas de envio**: registrar falha, confirmar/ack fila após registrar resultado, expor fila de falhas para intervenção manual. Não fazer `retry()` indiscriminado no consumer. Não há garantia de exactly-once para efeitos externos.
6. Falha de publicação da outbox deve ficar observável; **se a política de não retentar inclui publicação**, marcar falha e exigir reenvio manual. Se autorizar novas tentativas técnicas, documentar separadamente porque difere de falha SMTP/Gmail.
7. Resumo diário: evitar duplicação por chave única `(user_id, date_local, notification_type)`, respeitando fuso e horário preferido.

**Não prometer ausência absoluta de e-mails duplicados:** se o provedor aceitar e a resposta se perder, nem fila nem banco conseguem provar exatamente uma entrega. Usar chave idempotente no provedor quando existir e deixar registrado o risco.

## Filtros, índices e performance

Usar filtros no servidor por proprietário, texto, data, status, projeto/evento e paginação cursor ou offset com ordenação determinística; índices compostos em `user_id` + colunas de filtro; evitar N+1 na agenda. Limitar volume de expansão de recorrências. Não renderizar editor grande desnecessariamente na lista.

## Frontend e padrões

- React Query/TanStack Query como proposta para estado remoto, React Router ou equivalente conforme PoC de UI; somente consolidar dependências após scaffold.
- Formulários com schema Zod reutilizável; acessibilidade e estados conforme `STYLE.md`.
- Ação rápida de nota/tarefa. Agenda lê endpoint agregado somente para janela solicitada; ao clicar abre rota de origem.
- Não assumir que eventos, tarefas e publicações compartilham uma única tabela.

## Deploy e operacionalização

- Ambientes local e produção; dev/staging opcional conforme cotas.
- `.env.example`, `.dev.vars.example` sem segredos. Credenciais no secret manager.
- Migrations executadas em passo controlado, nunca automaticamente destrutivas durante build.
- Monitorar cotas gratuitas e configuração de retenção/consumo da fila.
- Banco com backup/exportação periódica externa ou recuperável; testar restauração.
- Logs estruturados com `request_id`, `outbox_id`, status e tempo; sem conteúdo confidencial.

## Referências de plataforma

- https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/
- https://developers.cloudflare.com/queues/
- https://developers.cloudflare.com/queues/platform/limits/
- https://developers.cloudflare.com/workers/configuration/cron-triggers/


## BE-018 — processamento interno implementado

O mesmo Worker exporta fetch via adaptador Express, scheduled e queue; sem
endpoint administrativo público. Fluxo: domínio/outbox → Cron → reserva
transacional → Queue → consumer → provedor futuro. Descoberta limitada é seguida
de lock users FOR UPDATE e CAS sob transação com audit, preservando ordem de
locks da BE-017. Somente leases de publicação expirados são recuperáveis.
Consumer sem provedor mantém PUBLISHED/ack; não registra SENT nem chama e-mail.
Infra anterior ao envio admite recuperação/retry limitado na fila com DLQ;
futuro envio ao provedor permanece sem retry automático.
Configuração, falhas e limites reais em [CRON-QUEUES](CRON-QUEUES.md).

## TASK-BE-019 — entrega por e-mail, resumo e histórico (para revisão)

Base main `5e7b3aa` (BE-018, PR #20). Branch `feat/BE-019-email-delivery-digest`.
Adaptador Gmail API HTTP/OAuth2 real, templates HTML/texto, planner diário limitado
com identidade owner/dia local e resumo reutilizando dashboard/calendário.
Consumer reserva entrega, revalida e registra aceite/falha sem retry de envio;
resultado incerto após aceite não autoriza reenvio automático.
GET /notifications e GET /notifications/:id autenticados, com paginação/filtros,
ownership e DTO público sem leases. OpenAPI atualizado. Sem migration nova.
EMAIL_DELIVERY_ENABLED=false por padrão; nenhum e-mail, acesso Neon, recurso remoto
ou deploy nesta tarefa. Configuração, decisão OAuth, limites e cenários pendentes
em [EMAIL-DELIVERY](EMAIL-DELIVERY.md). Os registros anteriores são históricos.
