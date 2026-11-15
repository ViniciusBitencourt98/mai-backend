# Decisões técnicas — registro de ADRs

## Decisões fechadas
- Frontend: React, Vite e TypeScript, repositório independente.
- Backend: Express, TypeScript e Cloudflare Workers, repositório independente.
- Banco: Neon PostgreSQL e Prisma com adapter compatível com Workers.
- Agendamento: Cloudflare Cron Triggers, Transactional Outbox e Cloudflare Queues.
- Entrega de e-mail: Gmail (API HTTP ou SMTP após PoC), falhas tratadas manualmente no MVP.
- Anotações/decupagens não exigem vínculos com projeto/evento.
- TASK-DOC-BE-001: ICS (F4-07/F4-08) e integração Google Calendar ficam em V2; não bloqueiam o MVP. Se houver exportação futura, arquivo não implica sincronização.

## Decisões pendentes (bloqueiam tickets dependentes, não todo o projeto)
- ADR-001: proposta implementada para revisão no PR F1-01–F1-04: [sessões opacas, PBKDF2 e CSRF](ADR-001-AUTHENTICATION.md). A aprovação final cabe ao mantenedor.
- ADR-002: cardinalidade dos vínculos entre notas, eventos e projetos (F2-04).
- ADR-003: datas sem hora e regras de recorrência/exceções (F3-01).
- ADR-004: [publicações e estados editoriais](ADR-004-EDITORIAL-PUBLICATIONS.md), proposta implementada para revisão em TASK-BE-012 (F4-01/F4-02).
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

## TASK-BE-009 — eventos com instantes e recorrência local (ADR-003)

Reutilizar schedule/validateRule e os DTOs IANA/calendário da TASK-BE-008; não mudar
contratos de tarefas. Os enums existentes de nome TaskRecurrence* são reutilizados
no Prisma para a mesma semântica, sem renomear tipos e causar migration incompatível.
Eventos acrescentam resolução de relógio local via Intl: gap omitido, fold primeiro
instante, duração fixa em milissegundos. A data original continua como identidade
(ruleId,date) mesmo ao mover. Slots DST omitidos contam no count civil. Sem RRULE
complexas e sem eventos all-day neste recorte; tarefas continuam civis sem horário.

Versões congelam âncoras temporais, exceções congelam os valores efetivos do
compromisso. PATCH regra cria nova série versionada; não transfere exceções.
Metadados do mestre afetam apenas datas sem exceção; tempos de série são editados
pela regra, mantendo a semente do mestre. Listagem mestre e expansão por série são
contratos distintos para um futuro calendário unificado. Overlap semiaberto após
exceções inclui movimentos para dentro e retira os movimentos para fora da janela.
Inativas/arquivo expõem somente exceções persistidas, como o histórico esparso das
tarefas; ENDED terminal. Duração máxima 31 dias controla lookback/expansão. Essa
restrição e as políticas de DST devem ser preservadas ou versionadas em revisão.


## TASK-DOC-BE-001 — estratégia, escopo e continuidade

Decisão explícita do mantenedor consolidada em [MVP_SCOPE](MVP_SCOPE.md) e
[DEVELOPMENT_WORKFLOW](DEVELOPMENT_WORKFLOW.md): Code First em dois repos/ambientes
Codex separados, sem exigir credenciais Neon aos agentes. Validação real ocorre
posteriormente na máquina do desenvolvedor; testes isolados/HTTP simulado não
atendem gates de banco/produção. Arquitetura Express/Workers/Prisma/Neon e
React/Vite/Tailwind preservada; branches, Conventional Commits, PRs e merge manual,
sem deploy automático. Os gates remotos antigos deixam de impedir implementação,
mas continuam pendências de validação real.

ICS/exportação e importação por arquivo no Google Calendar passam a V2, com IDs
F4-07/F4-08 preservados. F4-09 deixa de depender desses IDs; F5-01 e lançamento
não exigem ICS. Testes locais essenciais, segurança e validação com Neon continuam
no MVP; cobertura extensiva além desses fluxos fica em V2.

Identidade visual preservada: #315CFD, Montserrat em títulos, Inter em textos,
componentes próprios reutilizados e responsividade/acessibilidade essenciais.
Skill oficial shadcn/ui, skills do MAI e eventual adoção gradual estão em avaliação;
nenhuma migração de biblioteca foi aprovada. Este PR não instala nem substitui UI.

[PROJECT_STATUS](PROJECT_STATUS.md) registra os SHAs/evidências; BE-012 está na
main, FE-015 ainda é preparatória sem HTTP editorial. [NEXT_STEPS](NEXT_STEPS.md)
reserva BE-013, FE-016 e FE-017 sem reutilizar IDs. Relatórios antigos continuam
como histórico datado, não substituem o levantamento atual.


## TASK-BE-013 — projeção editorial no calendário

PUBLICATION é opt-in via types, mantendo TASK,EVENT como padrão por compatibilidade
com os consumidores existentes. scheduledAt é ponto temporal UTC sem duração e
sem fallback para publishedAt; fuso de apresentação vem da sessão. Omitir sem data,
arquivadas e CANCELLED, como as demais entidades canceladas na agenda; demais
estados manuais datados aparecem. Projeto opcional e identidade/href originais,
sem expor conteúdo editorial extra nem criar registro de evento/calendário.

Reusar o agregador/ordenação/paginação e limites existentes: até 100 registros
por tipo, consulta Prisma com janela/proprietário/arquivo/status e sentinela 101.
Publicações participam do orçamento global junto das expansões. Não alterar
recorrência, CRUD/editorial, schema, autenticação ou migrations. A projeção usa
índices já versionados na BE-012. Integração real com Neon permanece pendente;
FE-017 deve consumir o novo tipo só após incorporação do contrato.

## TASK-BE-014 — dashboard operacional com janelas explícitas

GET /dashboard usa date civil opcional e fuso da sessão, sem override de owner ou
timezone. Hoje mantém itens concluídos/publicados para contexto; listas futuras
excluem tarefas concluídas, publicações PUBLISHED e identidades já mostradas hoje.
Atraso é limitado aos 30 dias anteriores; próximos itens aos sete dias após o dia
selecionado. Estes limites são explícitos no retorno e não representam todo o
histórico. Listas até 20 (padrão 10), counts anteriores ao corte.

pendingTasks conta mestres ativos não arquivados globalmente, inclusive sem prazo;
o atraso conta tarefas/ocorrências incompletas da janela, sem duplicar o mestre.
plannedPublications conta somente o horizonte de hoje+sete dias sem PUBLISHED.
As unidades diferentes são documentadas para o frontend não tratar todos os
indicadores como globais. Não criar tabela/cache ou analytics neste recorte.

Reutilizar a coleta limitada do calendário e os motores de tarefas/eventos, sem
segunda implementação de recorrência. Extrair collect interno preservando o
resultado paginado de /calendar permite duas coletas disjuntas sem recomputar
cada página/lista. As duas janelas mantêm seus limites de fonte; dashboard limita
a soma visível a 10.000, sem truncamento silencioso. COUNT global fica no banco.
Validar dias reais (DST/meia-noite suprimida), não adicionar 24h a instantes locais.
Sem snapshot global prometido; sem nova migration, frontend, notificações ou deploy.

## TASK-BE-015 — perfil/preferências sem alterar contrato de sessão

GET/PATCH /me/preferences agrupam nome e preferências essenciais na própria conta.
Reutilizar User.name e UserPreferences.timezone/emailEnabled; adicionar somente
dailyDigestEnabled false e dailyDigestTime 08:00 (HH:mm local), com migration
aditiva e CHECK. Não duplicar e-mail/nome, criar tabela nova ou alterar senha.

Flags independentes preservam configuração ao desativar: o futuro envio de resumo
exigirá ambas true, mas esta API não agenda/envia. Horário nunca é instante UTC;
política de execução em DST será responsabilidade da futura tarefa de notificações.
PATCH omitido preserva, null rejeita; GET com relação ausente não grava e usa
defaults consistentes com o banco. Update do usuário ativo obtém bloqueio antes
do upsert, com name/preferências transacionais e apenas campos enviados; toca
User.updatedAt como auditoria. Nenhum dado temporal de domínio é reescrito.

Preservar /auth/me e DTO público da sessão com timezone/emailEnabled existentes.
Novos campos do resumo ficam no endpoint de preferências, evitando quebrar o
cliente atual. Servidor relê preferências em cada autenticação; frontend deve
refrescar sessão/visões após editar. Sem rotação/revogação desnecessária de sessão.
Conta indisponível na leitura/escrita resulta em 401, sem ID arbitrário aceito.
Code First: migration não aplicada, integração Neon/concorrência real pendente,
sem e-mails/filas/Cron/frontend; ICS permanece V2.

## TASK-BE-016 — política O-09/O-10 e outbox interna

Os marcadores O-09/O-10 do backlog não tinham política detalhada implementada.
[NOTIFICATIONS-OUTBOX](NOTIFICATIONS-OUTBOX.md) registra a proposta implementada
para revisão: antecedência 0–30 dias, tarefas civis às 09:00 no fuso aplicável,
eventos em startAt efetivo, publicações em scheduledAt e resumo na hora local
BE-015. Gap DST recusado, fold primeiro instante. Planejamento de envio limitado
aos próximos 30 dias; sem materialização antecipada ilimitada de recorrências.

ReminderRule, NotificationOutbox e NotificationDeliveryLog persistentes, com owner,
versões, chaves únicas, FKs compostas e CHECKs; referência polimórfica à origem
validada no repository, sem FK PostgreSQL aos três tipos de domínio. Estados
PENDING/RESERVED/PUBLISHED/SENT/FAILED/CANCELLED: PUBLISHED é aceite técnico da fila,
SENT apenas após aceite do provedor, não entrega/leitura. Lease técnico não é
credencial; reservas expiradas não são recuperadas para reenvio automático.

Não retentar automaticamente envio **nem publicação**. Falhas/expiração ficam
terminais e auditadas por categorias, sem tokens/respostas brutas de provedor.
Resumo único por proprietário/dia civil mesmo após cancelamento/falha; não é
reaberto automaticamente. Sem promessa de exactly-once externo; confirmação tardia
ou resposta perdida exige reconciliação manual antes de eventual novo envio.

Configuração efetiva da regra cancela suas intenções vivas atomicamente. Invalidação
por intenção e preflight nas transições estão implementados; hooks automáticos dos
CRUDs são F5-03 pendente. Há adapter para compartilhar a transação de domínio e
ordem futura de bloqueio usuário→origem→regra/outbox. Sem endpoints artificiais,
Cron/Queue/Gmail, conteúdo/envio de resumo, frontend ou deploy neste recorte.
Migration apenas versionada; integridade/concorrência reais aguardam Neon.
