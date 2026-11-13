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

## TASK-BE-005 — notas e cardinalidade (recorte de ADR-002)

Conforme o ticket, nota possui zero ou um projeto diretamente em projectId,
removível via null, com isolamento validado no serviço e FK composta no banco.
A proposta anterior de note_links não é implementada nesse recorte; eventos e
cardinalidade dos outros módulos continuam pendentes. Projetos arquivados do mesmo
proprietário podem ser vinculados; arquivamento não invalida histórico.
Tags são TEXT[] com GIN: simplicidade e busca PostgreSQL por tag exata sem catálogo
global. Campos com identidade/metadados ou renomeação global exigirão migração para
modelo normalizado futuro. O endpoint usa tag singular, normalizada, por consulta.
Sem editor rico, sem delete definitivo e sem alteração na arquitetura de auth.

## TASK-BE-006 — decupagens e timecodes

Zero ou um projeto opcional, sem evento até existir o modelo. Decupagem pode não
ter segmentos. Tags seguem notas. Timecode inicial obrigatório neste ticket
explícito, sobrepondo a proposta inicial de início opcional em RF-06.2. Usar offsets
INT em milissegundos, não strings HH:MM:SS nem instantes. Ordem editorial independente
da cronologia, sobreposição permitida. Reorder envia todos os IDs, com conjunto
validado dentro da transação; limite 100 mantém leitura/resposta/trabalho limitados.
Bloqueio no pai serializa operações concorrentes, UNIQUE adiada permite swaps e
rollback impede estado parcial. Projeto arquivado e decupagem arquivada continuam
editáveis; arquivar preserva registros. Nenhuma alteração na arquitetura de auth.

## TASK-BE-007 — tarefas, prazo civil e checklist

Usar os status em maiúsculas já documentados e enum de prioridade ordenado
LOW/MEDIUM/HIGH/URGENT. Datas civis startDate/dueDate seguem G-02; prazo com horário
é extensão futura. Atraso considera a data no fuso do usuário, só tarefas ativas,
sem confundir null com um instante. Estados terminais COMPLETED/CANCELLED exigem
reabertura para PENDING antes de outra transição. Conclusão repetida preserva
completedAt; reabrir limpa; subtarefas não bloqueiam nem herdam conclusão do pai.
Sem hierarquia ilimitada: subtarefas de um nível, até 100, permutação completa para
reorder. Projeto opcional próprio; sem recorrência/outbox/notificações nesse recorte.
Essas decisões cobrem a parte de datas simples de F3-01; recorrência segue pendente.

## TASK-BE-008 — recorrência sem horário (ADR-003, recorte de tarefas)

Ocorrências são datas civis calculadas sob demanda; somente estado individual e
log de conclusão são materializados. Identidade (ruleId,date) estável; edições
criam nova versão/ID e não transferem estados antigos para o novo calendário.
Histórico anterior permanece consultável, somente leitura. Suspensão/encerramento/
arquivo mostram apenas estados registrados, sem novas datas calculadas; retomada
preserva âncora e limites. ENDED terminal. Arquivo bloqueia mutações até restauração.
Mensal usa clamp ao último dia do mês com retorno ao dia original; semanal usa
semana ISO iniciada na segunda. Intervalos diários/customizados são aritmética de
calendário, sem somar 24 horas a instantes no fuso. Timezone IANA define a data de
hoje, preservando datas sem hora em DST. Horários locais/RRULE complexas são futuros.
Limites: 366 dias por janela, 100 itens por página, 10.000 datas por regra e 100
anos de horizonte, 100 versões por tarefa. Próxima data derivada, sem cron/filas.
Ações antigas da tarefa principal não se propagam a ocorrências; conclusão de
ocorrência só altera sua chave e log, preservando tarefa principal/subtarefas.
