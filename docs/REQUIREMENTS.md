# Requisitos funcionais e regras de negócio — MVP

**Referência de produto:** [`../README.md`](../README.md). Requisitos identificados para rastreabilidade; `[MVP]` é obrigatório, `[V2]` é explicitamente excluído. Dúvidas decidíveis por convenção estão registradas em `DECISIONS.md` como proposta, não como exigência já confirmada pela usuária.

## Regras transversais

- **G-01 [MVP]** Cada registro pertence a uma conta autenticada; leitura, filtros, associação e mutação nunca vazam dados de outro proprietário.
- **G-02 [MVP]** IDs opacos (UUID), datas de instante em UTC, apresentação no fuso configurado (padrão `America/Bahia`). Datas sem horário são datas civis, não instantes artificiais.
- **G-03 [MVP]** Criar e editar sem obrigar associação a projetos. Campos opcionais devem aceitar ausência e remoção do vínculo.
- **G-04 [MVP]** Cada listagem deve possuir paginação, ordenação estável, pesquisa quando aplicável e estados vazio/erro/carregamento.
- **G-05 [MVP]** Resposta da API com erros padronizados, validação de dados, idempotência para operações sensíveis e tratamento seguro de dados.
- **G-06 [MVP]** Exclusão/arquivamento de projeto não deve apagar registros independentes associados; desvincular ou bloquear com aviso conforme decisão de produto.
- **G-07 [MVP]** Ter auditoria mínima `created_at` e `updated_at`, sem trilha histórica sofisticada.

## RF-01 — Tarefas

- **RF-01.1 [MVP]** CRUD de tarefas com título obrigatório, descrição opcional, prioridade, status, data de prazo opcional (com ou sem horário), associação opcional a projeto e data de criação.
- **RF-01.2 [MVP]** Estados: pendente, em andamento, concluída, cancelada. Conclusão registra quando ocorreu; tarefa sem data pode existir na lista de pendentes.
- **RF-01.3 [MVP]** Subtarefas/checklist opcional; não exigir hierarquia ilimitada.
- **RF-01.4 [MVP]** Repetição simples diária, semanal, mensal e intervalo parametrizado; ocorrências concluídas individualmente; alterações de série e de ocorrência explicitamente diferenciadas.
- **RF-01.5 [MVP]** Filtros por status, prioridade, vencimento, texto, vínculo e projeto; tarefas datadas aparecem na agenda.
- **RF-01.6 [MVP]** Podem receber aviso por e-mail com antecedência e resumo diário se preferências permitirem.
- **RN-T01** Editar prazo/cancelar/concluir antes do aviso deve invalidar aviso obsoleto; envio em curso pode ser inevitável — registrar condição de corrida.
- **RN-T02** Atrasada significa tarefa ativa com prazo anterior ao momento/data local, conforme precisão do prazo.

## RF-02 — Eventos

- **RF-02.1 [MVP]** CRUD com título, descrição, início, término, local/link opcional, projeto opcional e tipo genérico de compromisso (ex.: gravação, reunião).
- **RF-02.2 [MVP]** Eventos pontuais ou recorrentes, inclusive semanais; recorrência com término opcional; exceções: cancelar ou mover ocorrência específica.
- **RF-02.3 [MVP]** Visualização diária/semanal/mensal; filtros e vínculo opcional para notas/decupagens.
- **RF-02.4 [MVP]** Exportação `.ics` de evento individual ou seleção e da série, com timezone e identificadores coerentes.
- **RN-E01** `end_at` deve ser posterior a `start_at`; definir comportamento para evento de dia inteiro e tempo local na Fase 2.
- **RN-E02** Alterar somente uma ocorrência não deve sobrescrever a série.

## RF-03 — Agenda e dashboard

- **RF-03.1 [MVP]** Exibir eventos, tarefas datadas e publicações datadas em visões dia/semana/mês; distinguir tipos e horários sem transformar os registros em um único domínio.
- **RF-03.2 [MVP]** Filtrar por tipo, data e projeto quando houver vínculo; clicar abre o registro original.
- **RF-03.3 [MVP]** Dashboard mostra tarefas de hoje, compromissos próximos, publicações previstas e pendências atrasadas; ações rápidas para tarefa/anotação.
- **RN-A01** Eventos e publicações com horário ocupam períodos/pontos; tarefas sem horário aparecem em seção de tarefas do dia, não bloqueiam faixa horária arbitrária.
- **RN-A02** Na expansão da agenda limitar janela e paginação; não materializar recorrência infinita.

## RF-04 — E-mails e lembretes

- **RF-04.1 [MVP]** Configurar preferência de receber avisos; lembrete por antecedência relativa ao prazo/início ou em horário absoluto válido.
- **RF-04.2 [MVP]** Enviar resumo diário com tarefas, eventos e publicações relevantes do dia no fuso do usuário.
- **RF-04.3 [MVP]** Persistir intenção de envio em `transaction_outbox` dentro da mesma transação da alteração de domínio; despacho via Cron e fila; consumer e-mail assíncrono.
- **RF-04.4 [MVP]** Exibir status dos envios e erros para intervenção manual; **não** tentar novamente automaticamente em caso de falha do provedor neste MVP.
- **RN-N01** Diferenciar `PENDING`, `PUBLISHED`, `SENT`, `FAILED`, `CANCELLED`, com estados técnicos de reserva/lease conforme modelo.
- **RN-N02** Verificar idempotência por notificação/versão e cancelar avisos de registros excluídos, concluídos ou reagendados; fila pode entregar mensagens duplicadas.
- **RN-N03** Ao confirmar envio, registrar aceite do provedor; não presumir entrega em caixa de entrada ou leitura.
- **RN-N04** Falhas de entrega/publicação ficam observáveis. Se a política é não repetir automaticamente, configurar consumer conscientemente para não usar os retries padrão da fila para falhas do provedor; erros transitórios podem resultar em lembretes não enviados.
- **RN-N05** Gmail pessoal é candidato, não garantia operacional; PoC de Gmail API OAuth ou SMTP no Workers e registro de limitações antes da integração definitiva.

## RF-05 — Anotações livres

- **RF-05.1 [MVP]** CRUD de nota com título obrigatório, conteúdo opcional, tags opcionais, timestamps e proprietário.
- **RF-05.2 [MVP]** Nota existe sem projeto e sem evento; pode vincular/desvincular posteriormente a projeto **e/ou** evento.
- **RF-05.3 [MVP]** Buscar título/conteúdo; filtrar por tags, projeto, evento, com/sem vínculo e datas.
- **RF-05.4 [MVP]** Captura rápida sem vínculo, diretamente do dashboard.
- **RN-AN01** Vincular nota não altera automaticamente evento ou projeto e nunca exige novo cadastro.

## RF-06 — Decupagens

- **RF-06.1 [MVP]** CRUD de decupagem com título, texto/observações, tags e vínculos opcionais iguais às notas.
- **RF-06.2 [MVP]** Criar/editar/remover/ordenar trechos com timecode inicial opcional, final opcional, descrição e observações; permitir texto livre sem trechos.
- **RF-06.3 [MVP]** Buscar título, texto e descrições dos trechos; filtrar por projeto/evento/ausência de vínculo.
- **RN-D01** Timecodes representam posição relativa dentro de uma mídia, não horário civil nem data. Normalizar formato; validar início/fim quando ambos existirem.
- **RN-D02** Sem upload de mídia, transcrição, análise automática ou player no MVP; URL externa opcional após validação.

## RF-07 — Projetos (opcionais)

- **RF-07.1 [MVP]** CRUD simples: nome, descrição e status (ativo/arquivado); listar registros associados.
- **RF-07.2 [MVP]** Nenhum módulo exige projeto para ser utilizado; permitir vínculo e remoção de vínculo sem apagar dados.
- **RN-P01** Arquivamento preserva histórico; desassociação segura para remoção definitiva.

## RF-08 — Publicações / calendário editorial básico

- **RF-08.1 [MVP]** CRUD com título, descrição/legenda opcional, plataforma, formato, data/hora prevista, status manual, referência/link externo e projeto opcional.
- **RF-08.2 [MVP]** Listagem por data, plataforma e status; visualização na agenda e lembretes por e-mail.
- **RN-PUB01** `AGENDADO` não implica agendamento real na rede; `PUBLICADO` somente por ação explícita da usuária.
- **RN-PUB02** Fluxo sofisticado de aprovação, revisão por clientes e publicação automática estão fora do escopo.

## RF-09 — Autenticação, preferências e segurança

- **RF-09.1 [MVP]** Login seguro, sessão, logout, recuperação de acesso conforme mecanismo escolhido e isolamento por proprietário.
- **RF-09.2 [MVP]** Preferências de fuso, e-mail de destino, horário do resumo e habilitação/desabilitação de avisos.
- **RN-U01** Não compartilhar credenciais de e-mail no navegador; secrets no backend; login deve ter proteção contra abuso e política de sessão.

## RF-10 — Exportações

- **RF-10.1 [MVP]** Gerar `.ics` compatível com importação do Google Calendar, com `UID`, campos escapados, DTSTART/DTEND e tratamento de recorrência/exceções consistente.
- **RN-X01** Exportar **não** configura sincronização; mudanças posteriores na aplicação não serão refletidas automaticamente no Google Calendar.

## Requisitos não funcionais

- **RNF-01** Compatibilidade com smartphone e desktop; acessibilidade de teclado, foco e contraste (seguir `STYLE.md`).
- **RNF-02** Startup e deploy na modalidade gratuita quando viável; medir/monitorar limites, sem prometer SLA.
- **RNF-03** Backup/exportação de dados e procedimento de restauração documentados; não depender exclusivamente do provedor gratuito para integridade.
- **RNF-04** TypeScript strict, schemas compartilhados criteriosos, testes automatizados para lógica crítica e CI com lint/typecheck/testes/build.
- **RNF-05** Logs estruturados sem informações confidenciais, tratamento de erros e observabilidade dos jobs.
- **RNF-06** Segurança de CORS, sessão, autenticação, autorização e limitação de abuso; proteção de dados conforme necessidade real.
- **RNF-07** Testar datas, diferenças de fuso, séries recorrentes, exceções, idempotência e mensagens obsoletas.

## Critérios de aceite end-to-end mínimos

1. Registrar nota sem projeto/evento; localizar por texto; vincular a evento posteriormente; filtrar por vínculo; desvincular sem perda de conteúdo.
2. Criar decupagem com dois timecodes e nota livre; editar os trechos; buscar descrição; manter sem projeto.
3. Criar tarefa para amanhã e concluí-la; a agenda exibe a tarefa; o lembrete previamente agendado não é disparado após a conclusão.
4. Criar gravação semanal; mover só a próxima ocorrência; a série futura permanece intacta.
5. Criar publicação datada; aparece na agenda com status manual e sem postar em rede social.
6. Configurar resumo diário; registro outbox é criado; despacho, fila e consumer processam no ambiente de testes; erros de envio ficam visíveis.
7. Exportar uma gravação `.ics` e validar o conteúdo em leitor iCalendar; documentar que não há sincronização.
8. Usuário A não acessa, associa ou altera registros do usuário B, incluindo filtros de buscas e vínculos.
