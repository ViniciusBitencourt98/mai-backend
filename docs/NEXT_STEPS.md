# Próximas entregas e dependências

Plano consolidado em TASK-DOC-BE-001, a partir das mains registradas em
[PROJECT_STATUS](PROJECT_STATUS.md). Isto não autoriza executar todas as tarefas:
um ticket por execução e PR/revisão por repositório. Escopo vigente em
[MVP_SCOPE](MVP_SCOPE.md); IDs F0–F6/V2 existentes mantêm seu significado.

## Sequência de trabalho

| Tarefa / ID existente | Repositório | Dependências | Entrega / limite |
|---|---|---|---|
| **TASK-BE-013** — publicações no calendário (F4-04, parcela backend) | Backend | BE-010/011 e BE-012 incorporadas | Ampliar DTO/projeção/OpenAPI de /calendar para publicações datadas, com ownership, filtros, paginação/limites e testes; sem postagem externa |
| **TASK-FE-016** — integração de publicações (F4-03) | Frontend | FE-015 e BE-012 incorporadas | Adaptador HTTP real, sessão/CSRF, enums/campos/datas/filtros conforme OpenAPI; substituir indisponibilidade por integração sem fallback demo silencioso |
| **TASK-FE-017** — publicações no calendário (F4-04, parcela frontend) | Frontend | BE-013 incorporada; FE-016; FE-013/014 já incorporadas | Consumir novo tipo/filtro, representar e abrir publicação original; preservar tarefas/eventos/fusos |
| **F4-05** — dashboard agregado | Backend | F3-13/BE-010, F4-02/BE-012; conferir contrato com BE-013 | Endpoint autenticado de hoje, atrasadas e próximos eventos/publicações; limites/fuso/ownership e OpenAPI |
| **F4-06** — dashboard básico e ações rápidas | Frontend | F4-05 incorporada, FE-008/010 e integração editorial FE-016 | Substituir placeholder por dados reais e ações de tarefa/anotação; sem analytics V2 |
| **F1-08** — perfil e preferências | Backend → frontend | Auth F1-02/03/04; lacunas confirmadas no status | Definir edição de timezone/preferências necessárias ao e-mail, contrato antes da tela; leitura de auth/me não basta |
| **F5-01–F5-14** — notificações/e-mail/resumo | Backend e frontend em tickets próprios | Fluxos de domínio; F4-09 sem ICS; F1-08 para preferências; PoCs F0-09/10/11 | Outbox transacional, scheduler/fila, adaptador Gmail, idempotência, resumo por fuso e observabilidade; sem retry automático de envio |
| **F6-03** — auditoria visual/componentes | Frontend | UI atual e STYLE; pode iniciar em paralelo com APIs | Inventariar/reutilizar componentes, corrigir responsividade/acessibilidade/estilo essenciais; não migrar biblioteca sem aprovação |
| **F2-13, F3-17, F4-09** — validação local dos fluxos | Máquina do desenvolvedor, ambos os repos | Migrations de desenvolvimento conferidas e contratos/clients implementados | Executar fluxos essenciais com Neon real, dois usuários, persistência/constraints/transações; registrar falhas e dados sintéticos de teste |
| **F6-01/02/04/05/06** — correções e preparação | Ambos, em PRs separados | Resultados locais, auditoria e fluxos de e-mail implementados | Corrigir regressões/segurança, backup/restore, falhas e observabilidade antes da publicação |
| **F6-07–F6-12** — lançamento e aceite final | Ação manual do mantenedor | Aceite e configuração de deploy revisados | Publicar explicitamente, smoke hospedado, quotas/UX (F6-09/10), correções/congelamento (F6-11) e manual; sem deploy automático/ICS |

BE-013, FE-016 e FE-017 são os próximos IDs informados pelo mantenedor. BE-013
foi implementada na branch feat/BE-013-calendar-publications após o levantamento
DOC-BE-001, aguardando revisão/merge e Neon; FE-016/017 não foram implementadas
por essa entrega. Para dashboard,
perfil, notificações e auditoria, usar os IDs F já existentes até o mantenedor
atribuir um TASK-BE/FE próprio. Não inventar BE-014/FE-018 nem reutilizar FE-015.

## O que pode avançar em paralelo

BE-013 e FE-016 usam a base BE-012 já incorporada e podem ser desenvolvidas em
ambientes Codex separados. FE-017 aguarda o contrato de calendário de BE-013 e a
integração editorial de FE-016. Auditoria visual pode trabalhar com a UI existente;
se tocar nos mesmos componentes/rotas de FE-016/017, combinar limites de arquivos
e revisar conflitos. Cada PR registra dependências e exige merge manual.

A API do dashboard pode ser desenhada em paralelo, mas o PR frontend depende do
contrato efetivamente incorporado. E-mail não precisa esperar ICS: o gate F4-09
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
