# Escopo atual do MVP e V2

Decisão de escopo do mantenedor em TASK-DOC-BE-001 (2026-11-14), consolidando o
pedido inicial DOC-001. Este documento resolve referências antigas que ainda
incluíam ICS como gate do MVP. Não muda stack nem afirma implementação concluída;
ver [PROJECT_STATUS](PROJECT_STATUS.md) para evidências e [NEXT_STEPS](NEXT_STEPS.md)
para dependências. IDs antigos são preservados para rastreabilidade.

## Permanece no MVP

| Área | Resultado essencial esperado |
|---|---|
| Autenticação | Login/sessão/logout, proteção de rotas, CSRF e isolamento por proprietário |
| Projetos | Agrupamento opcional, edição/arquivo sem apagar registros vinculados |
| Anotações | Captura independente, edição, pesquisa/filtros e vínculos opcionais autorizados |
| Decupagens | Conteúdo independente e segmentos/timecodes com ordem persistida |
| Tarefas/subtarefas | Estados, prioridade, prazo, checklist e operações individuais |
| Recorrência | Frequências simples, versões, estados/exceções individuais, fusos e limites |
| Eventos/calendário | CRUD/séries e agenda unificada dia/semana/mês, sem transformar tarefas em eventos |
| Publicações editoriais | CRUD manual, status, datas, projeto opcional e inclusão na agenda; sem postagem social |
| Dashboard básico | Visão de hoje/atrasadas/próximos eventos/publicações e ações rápidas |
| E-mail | Preferências necessárias, lembretes/resumo diário, outbox transacional, Cron/Queues/Gmail, falhas observáveis sem retry automático de envio |
| Interface | Responsividade, acessibilidade e refinamentos visuais essenciais com componentes existentes |
| Validação | Lint/typecheck/testes/build e fluxos locais essenciais com Neon na máquina do desenvolvedor, incluindo ownership e persistência real |

Lacunas entre o requisito original e os recortes implementados devem ser
priorizadas explicitamente no ticket correspondente; não recriar módulo concluído
nem adicionar silenciosamente novas exigências. Perfil/preferências necessários
para fuso/resumo diário ainda dependem de contrato de edição. Backup/recuperação de
dados e segurança básica não são dispensados pela retirada do exportador ICS.

## Transferido ou mantido em V2

- Exportação de arquivo ICS e importação de eventos no Google Calendar por ICS:
  IDs preservados **F4-07** (gerador) e **F4-08** (endpoint/UI).
- Integração/sincronização Google Calendar: **V2-03**; futura exportação de arquivo
  não implica sincronização bidirecional ou atualização automática.
- Publicação automática em redes sociais: **V2-06**.
- Upload/processamento de mídia, player/transcrição: **V2-02**.
- Aprovação/revisão editorial complexa por clientes: **V2-01**.
- WhatsApp/push: **V2-04**; colaboração/equipes/permissões avançadas: **V2-05**.
- Analytics/dashboard avançado: **V2-08**; PWA offline: **V2-07**.
- Revisões extensivas de cobertura além dos fluxos essenciais: V2, sem remover
  testes locais existentes nem adiar correções de segurança/integridade.

Não reservar novos números V2 para esses itens sem conferir o backlog; F4-07/08
mantêm o significado original e apenas mudam de fase de entrega.

## Dependências e aceite sem ICS

F4-09 passa a validar **editorial + agenda + dashboard**, dependendo de F4-03,
F4-04 e F4-06. F4-07/F4-08 não são mais dependências desse gate. Assim F5-01 e
as notificações deixam de depender indiretamente do exportador. F6-08 faz smoke
manual autorizado de autenticação/CRUD, agenda/publicações/dashboard e e-mail,
sem exigir ICS. F6-04 continua tratando backup/restauração de dados, não calendário.

A conclusão do MVP exige os fluxos essenciais com banco real no ambiente local
do desenvolvedor, correções relevantes, revisão visual e aceite do mantenedor.
Publicação em Vercel/Workers é etapa manual autorizada de lançamento; testes
isolados e builds locais não provam que ela ocorreu. Não exigir features V2 para
concluir o MVP e não marcar E2E real como aprovado por uso de mocks.

## Direção de interface preservada

[STYLE](../STYLE.md) é a referência: cor principal **#315CFD**, Montserrat nos
títulos e Inter nos textos. Frontend já possui tokens Tailwind/CSS, componentes
em `src/components/ui`, shell e rota `/design-system`. Reutilizar esses componentes,
com loading/vazio/erro, foco visível, teclado, contraste e telas mobile/desktop.
Há refinamentos visuais pendentes após execução local pelo desenvolvedor.

Estão em avaliação a skill oficial do shadcn/ui, skills específicas do Projeto
MAI e eventual adoção gradual de componentes shadcn/ui. **Nenhuma migração de
biblioteca visual foi aprovada.** Não instalar skills/bibliotecas nem substituir
componentes como consequência desta documentação; qualquer adoção exige decisão
e tarefa própria, preservando identidade visual e acessibilidade.
