# Próximas entregas e dependências

## Após BE-018 — implementação preparada para revisão

BE-017 já incorporada no PR #19; BE-018 prepara F5-06/F5-07 e estrutura F5-08.
Ver [CRON-QUEUES](CRON-QUEUES.md). Próximas tarefas próprias: validação real
Neon/concorrência e Cron/Queues/DLQ, PoC/adaptador Gmail sem retry de envio,
planejador de renovação da janela, conteúdo de resumo e intervenção operacional.
Consumer atual faz ack sem provedor e mantém PUBLISHED; não reprocessar esses
registros automaticamente quando um provedor for ativado. Sem dependência nova
para frontend e sem recurso remoto criado.


Plano consolidado em TASK-DOC-BE-001, a partir das mains registradas em
[PROJECT_STATUS](PROJECT_STATUS.md). Isto não autoriza executar todas as tarefas:
um ticket por execução e PR/revisão por repositório. Escopo vigente em
[MVP_SCOPE](MVP_SCOPE.md); IDs F0–F6/V2 existentes mantêm seu significado.

## Sequência de trabalho

| Tarefa / ID existente | Repositório | Dependências | Entrega / limite |
|---|---|---|---|
| **TASK-BE-013** — publicações no calendário (incorporada, PR #15) | Backend | BE-010/011 e BE-012 incorporadas | Ampliar DTO/projeção/OpenAPI de /calendar para publicações datadas, com ownership, filtros, paginação/limites e testes; sem postagem externa |
| **TASK-FE-016** — integração de publicações (F4-03) | Frontend | FE-015 e BE-012 incorporadas | Adaptador HTTP real, sessão/CSRF, enums/campos/datas/filtros conforme OpenAPI; substituir indisponibilidade por integração sem fallback demo silencioso |
| **TASK-FE-017** — publicações no calendário (F4-04, parcela frontend) | Frontend | BE-013 incorporada; FE-016; FE-013/014 já incorporadas | Consumir novo tipo/filtro, representar e abrir publicação original; preservar tarefas/eventos/fusos |
| **TASK-BE-014 / F4-05** — dashboard agregado (incorporado, PR #16) | Backend | F3-13/BE-010, F4-02/BE-012; conferir contrato com BE-013 | Endpoint autenticado de hoje, atrasadas e próximos eventos/publicações; limites/fuso/ownership e OpenAPI |
| **F4-06** — dashboard básico e ações rápidas | Frontend | F4-05 incorporada, FE-008/010 e integração editorial FE-016 | Substituir placeholder por dados reais e ações de tarefa/anotação; sem analytics V2 |
| **TASK-BE-015 / F1-08** — perfil e preferências (backend incorporado, PR #17) | Backend → frontend | Auth F1-02/03/04; lacunas confirmadas no status | Definir edição de timezone/preferências necessárias ao e-mail, contrato antes da tela; leitura de auth/me não basta |
| **TASK-BE-016 / F5-01–02**, depois **F5-03–F5-14** — notificações/e-mail/resumo | Backend e frontend em tickets próprios | Fluxos de domínio; F4-09 sem ICS; F1-08 para preferências; PoCs F0-09/10/11 | Outbox transacional, scheduler/fila, adaptador Gmail, idempotência, resumo por fuso e observabilidade; sem retry automático de envio |
| **F6-03** — auditoria visual/componentes | Frontend | UI atual e STYLE; pode iniciar em paralelo com APIs | Inventariar/reutilizar componentes, corrigir responsividade/acessibilidade/estilo essenciais; não migrar biblioteca sem aprovação |
| **F2-13, F3-17, F4-09** — validação local dos fluxos | Máquina do desenvolvedor, ambos os repos | Migrations de desenvolvimento conferidas e contratos/clients implementados | Executar fluxos essenciais com Neon real, dois usuários, persistência/constraints/transações; registrar falhas e dados sintéticos de teste |
| **F6-01/02/04/05/06** — correções e preparação | Ambos, em PRs separados | Resultados locais, auditoria e fluxos de e-mail implementados | Corrigir regressões/segurança, backup/restore, falhas e observabilidade antes da publicação |
| **F6-07–F6-12** — lançamento e aceite final | Ação manual do mantenedor | Aceite e configuração de deploy revisados | Publicar explicitamente, smoke hospedado, quotas/UX (F6-09/10), correções/congelamento (F6-11) e manual; sem deploy automático/ICS |

BE-013 foi incorporada à main pelo PR #15; a validação Neon continua pendente.
FE-016/017 pertencem ao frontend e não foram executadas por BE-014; conferir a
main daquele repo antes de iniciar suas tarefas, pois o retrato DOC-BE-001 é datado. TASK-BE-014 foi incorporada no PR #16; a UI segue F4-06 até receber ID próprio.
TASK-BE-015 foi incorporada no PR #17. A futura UI de preferências depende desse contrato
e segue F1-08 até receber ID próprio. Para notificações/auditoria, preservar os IDs F existentes. Não inventar novos IDs
BE/FE nem reutilizar FE-015.

## O que pode avançar em paralelo

BE-013 já está incorporada. FE-016 pode usar o contrato BE-012; FE-017 depende
da integração editorial FE-016 e já pode conferir o contrato de calendário BE-013.
Os trabalhos de UI e backend usam ambientes Codex separados. Auditoria visual pode trabalhar com a UI existente;
se tocar nos mesmos componentes/rotas de FE-016/017, combinar limites de arquivos
e revisar conflitos. Cada PR registra dependências e exige merge manual.

A API do dashboard está incorporada no PR #16; o frontend F4-06 pode consumir
GET /dashboard. Para preferências, consumir
GET/PATCH /me/preferences, refrescando /auth/me após editar. E-mail não precisa esperar ICS: o gate F4-09
foi reduzido aos fluxos editoriais/agenda/dashboard essenciais.

## Lacunas a tratar antes do aceite integrado

- FE-016 deve resolver as incompatibilidades provisórias de publicações listadas
  em PROJECT_STATUS; não enviar plannedAt/observations/timezone nem SCHEDULED
  como se fossem DTOs atuais do backend.
- API de calendário hoje aceita só TASK/EVENT. Não adicionar filtro editorial só
  no frontend nem preencher a agenda com dados demo nas rotas reais.
- Corrigir as descriptions obrigatórias ausentes nas respostas OpenAPI legadas
  de decupagens em tarefa documental de contrato própria; não alterar rotas/DTOs
  para contornar erro de documentação.
- Resolver/revalidar o acesso ao CDN Prisma no ambiente que executará o CLI, sem
  ignorar verificações. Reproduzir geração/instalação padrão antes de declarar
  ambiente novo pronto; a alternativa oficial atual é evidência local limitada.
- Conferir divergências dos requisitos iniciais com os recortes de notas,
  decupagens, tarefas e perfil (busca ampliada, vínculos a eventos, prazo com hora,
  recuperação de acesso). Priorizar no ID funcional correspondente; não presumir
  que tudo foi entregue pelo merge de um CRUD.
- Registrar publicação/CI/validação real quando houver evidência; checkboxes e
  nomes "integração real" nos tickets do cliente não provam E2E com Neon.

## Roteiro de validação e encerramento

Seguir [DEVELOPMENT_WORKFLOW](DEVELOPMENT_WORKFLOW.md#validação-real-posterior-na-máquina-do-desenvolvedor)
e [F3-BACKEND-NEON-VALIDATION](F3-BACKEND-NEON-VALIDATION.md). Credenciais ficam na
máquina/configuração segura do desenvolvedor; não são pré-requisito dos agentes.
Começar com auth/CRUD/ownership, segmentos/subtarefas e recorrências; depois agenda,
publicações, dashboard, preferências e notificações. Publicações ainda precisam
cobertura integrada real além dos 13 testes externos existentes.

Registrar SHAs, cenários, resultados/skips e falhas reais. Corrigir falhas nos
repos responsáveis, revisar PRs, repetir apenas checks afetados e obter aceite.
ICS/Google, automações, mídia, colaboração e cobertura extensiva V2 não bloqueiam
esse encerramento. Não remover os testes locais essenciais.


## Após a fundação BE-016

TASK-BE-016 implementa a estrutura interna na branch feat/BE-016-notification-outbox,
aguardando revisão/incorporação. Não equivale a notificações operacionais. Seguir
NOTIFICATIONS-OUTBOX.md: F5-03 integra criação/invalidação à mesma transação de
negócio, respeitando ordem de bloqueio usuário→origem→regra/outbox; F5-04 prepara
regras/UI, F5-05 conteúdo/planejador do resumo, F5-06/07 dispatcher/producer e
F5-08–11 adaptador/consumer/resultado/ack sem retry automático. PoCs F0-09/10/11 e
validação Neon continuam necessárias antes do aceite integrado. F5-12/13 tratam
observabilidade/reconciliação/reenvio manual autorizado; lease expirado jamais
justifica reenvio automático. Não inventar novo ID BE para os próximos recortes.


## Após BE-017

BE-016 está incorporada no PR #18. BE-017 implementa F5-03 e a configuração mínima
de regras na branch feat/BE-017-domain-reminders, aguardando revisão/incorporação.
Frontend pode consumir GET/PUT /reminders após merge em tarefa própria. Ainda faltam
renovação periódica de janela, conteúdo/resumo, dispatcher Cron, producer/consumer
Queue, provedor e reconciliação/observabilidade. Neon real permanece pendente.
