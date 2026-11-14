# Roadmap executável — MVP

Este roteiro segue as dependências de código/contrato. Conforme TASK-DOC-BE-001, a implementação avança Code First sem exigir credenciais nos agentes; gates locais com Neon e remotos permanecem pendentes até validação real. [MVP_SCOPE](MVP_SCOPE.md) define o escopo vigente, [PROJECT_STATUS](PROJECT_STATUS.md) as evidências e [NEXT_STEPS](NEXT_STEPS.md) a fila. IDs apontam para [BACKLOG](BACKLOG.md).

| Fase | Entrega e valor | Tickets | Gate de saída | Esforço indicativo* |
|---|---|---|---|---|
| **0. Descoberta técnica e fundação** | Dois repositórios, SPA na Vercel, Express Workers, Neon, CI e PoCs | F0-01–F0-13 | Deploy API + web, Prisma query/tx, Queue, Cron e e-mail PoC comprovados | 10–16h |
| **1. Identidade e padrões** | Auth, autorização, shell UI, contratos e componentes | F1-01–F1-09 | Usuária entra e só vê os próprios dados | 7–12h |
| **2. Organização livre** | Projetos simples, notas e decupagem com filtros | F2-01–F2-13 | Nota/decupagem sem vínculo, vincular depois, pesquisar | 10–16h |
| **3. Planejamento operacional** | Tarefas, eventos, recorrências e agenda | F3-01–F3-17 | Regras de recorrência e exceções funcionando em agenda | 14–24h |
| **4. Conteúdo editorial** | Publicações e dashboard básico | F4-01–06,F4-09 (F4-07/08 em V2) | Conteúdos na agenda e dashboard validados localmente com API/Neon | 6–11h |
| **5. Notificações** | Outbox, Cron, fila, consumer e e-mail | F5-01–F5-14 | Envio fim-a-fim e falha registrada sem retry automático | 9–16h |
| **6. Qualidade e lançamento** | E2E, segurança, backups, documentação e deploy | F6-01–F6-12 | Aceite com a usuária e operação mínima documentada | 8–14h |

*Estimativas indicativas de trabalho humano com Codex, sujeitas a ajuste após a Fase 0. **Total histórico, anterior à retirada de ICS: 64–109h**; intervalo mais largo que a estimativa inicial porque inclui documentação operacional, autenticação, recorrência robusta e validação real do runtime. Não é compromisso de prazo.

## Marcos e dependências

```mermaid
flowchart LR
 A[Fase 0: PoC e base] --> B[Fase 1: Auth e UI]
 B --> C[Fase 2: Projetos, notas, decupagem]
 B --> D[Fase 3: Tarefas, eventos, agenda]
 C --> D
 D --> E[Fase 4: Publicações e dashboard]
 E --> F[Fase 5: Lembretes e e-mails]
 F --> G[Fase 6: Lançamento]
```

## Estratégia de execução com Codex

1. Abrir **um ticket por vez**, citando ID e os documentos: `AGENTS.md`, `STYLE.md` (quando UI), `REQUIREMENTS.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, `API.md`.
2. O Codex deve entregar **a parte do ticket pertencente ao repositório atual**: backend (schema/migration, DTO, repository, service, endpoint Express, testes) ou frontend (UI, cliente HTTP, testes). Dependências entre repos exigem PRs separados.
3. Implementar migrations pequenas/versionadas conforme o ticket, sem aplicação automática; preservar decisões da Fase 0 e validar integração real posteriormente na máquina do desenvolvedor.
4. Revisar PR por checklist e critérios de aceite; evitar grandes PRs com várias features independentes.
5. Bloquear mudanças em stack (Express → Hono, Neon → D1, Queues → BullMQ) sem ADR e aprovação.
6. Deploy dos módulos gradualmente, mas **não habilitar envio real de e-mail** antes de validação do consumer e dos destinatários.

## Critérios para declarar MVP lançado

- Roteiros e fluxos descritos em `REQUIREMENTS.md` passaram no ambiente hospedado.
- Isolamento multiusuário testado mesmo que haja uma única usuária inicial.
- Tarefas, eventos recorrentes, notas e decupagens sem vínculo, projetos opcionais, publicações e agenda funcionais no celular.
- Resumo diário e lembretes enviam e registram falhas, sem retentativas automáticas não autorizadas.
- Fluxos essenciais com Neon local validados; ICS/Google Calendar ficam em V2 e não bloqueiam o aceite.
- Procedimento de backup e recuperação documentado; segredos protegidos; custo e cotas conferidos.
- Sem vulnerabilidades críticas conhecidas, sem erros de typecheck/testes/build e com feedback da usuária registrado.

## Fila pós-MVP (não executar no roadmap principal)

F4-07/F4-08 (gerador e exportação/importação ICS) ficam em V2 com IDs preservados.

`V2-01` portal de aprovação; `V2-02` upload/player/transcrição; `V2-03` sincronização Google Calendar; `V2-04` notificações push/WhatsApp; `V2-05` times e permissões; `V2-06` automação de publicação; `V2-07` PWA offline/instalável; `V2-08` dashboards avançados e métricas.
