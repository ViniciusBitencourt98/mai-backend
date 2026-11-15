# TASK-BE-020 — revisão de notificações

Base main 8b740f0 (BE-019 incorporada no PR #21). Revisão Code First dos módulos
BE-016 a BE-019; sem envios, recursos remotos, migrations reais ou deploy.

## Achados e correções

| Achado | Correção / evidência |
|---|---|
| Janela de lembretes só se renovava por escrita de domínio/configuração | Cron chama renewReminders antes do planejamento de resumos; reutiliza synchronizeReminders/schedule/notificationSource, sem motor novo |
| Um lote sempre começando na primeira regra poderia deixar regras posteriores sem renovação | Cursor UUID persistente com seleção keyset, wrap e até 20 regras distintas por execução; conta ativa/regra habilitada |
| Erro parcial da renovação poderia avançar cursor ou bloquear toda a fila | Cursor e regra na mesma transação; erro de banco reverte o passo e mantém cursor; NOTIFICATION_LIMIT reverte ao savepoint antes de avançar; falha de manutenção é sanitizada e não impede dispatcher de registros existentes |
| Assunto MIME longo gerava encoded word acima do limite RFC 2047 | Encoded words UTF-8 <=75 caracteres, folding CRLF+espaço e preservação de code points; teste de reconstrução com emoji/acentos |

Migration aditiva `20261115000300_notification_renewal_cursor` cria somente a
pequena tabela interna de progresso. Não aplicada. O cursor não altera updatedAt,
versão ou configuração de regras de usuário; não tem FK para que exclusão de regra
não invalide progresso. A configuração Prisma/modelo também foi atualizada.
Migration deve ser revisada/aplicada em desenvolvimento autorizado antes de testar
renovação real. Se ausente, manutenção registra RENEWAL_FAILED; o dispatcher de
intenções existentes continua. Não apresentar isso como renovação operacional.

A transação de manutenção bloqueia cursor → usuário → fonte → outbox. Apenas
manutenção adquire cursor; escritores de domínio continuam usuário → fonte →
outbox e nunca aguardam cursor, evitando inversão de ordem entre esses caminhos.
Cada passo tem timeout 30s/maxWait 10s. Máximo 20 regras, cada regra com limites
existentes de expansão/intenção. Sobreposição entre Crons é serializada pelo lock
do cursor; pode causar trabalho repetido entre invocações, mas identidade única
não permite nova intenção equivalente. Horizonte de 30 dias não é backfill:
registros cujo instante de envio já passou não são criados. Frequência/volume
precisam manter um ciclo completo antes de vencer a antecedência; sem promessa de
latência sob backlog. NOTIFICATION_LIMIT pula a regra somente nesse ciclo, com
log RENEWAL_LIMIT e rollback de alterações parciais, tentando em ciclo futuro.
Uma falha repetida de banco mantém a regra no cursor e exige investigação.

## Fluxo revisado e evidências existentes preservadas

- Domínio: scopes reais compartilham transação e lock do proprietário com outbox
  e audit; erro de hook aborta mutação. Repositories isolados sem hooks são testes,
  não o caminho de produção. Preferências fazem lock por UPDATE antes da sincronização.
- Intenções: identidade SHA-256/unique por dono e versão/ocorrência; resumo único
  por dono/dia civil, inclusive após FAILED/CANCELLED. Opt-in explícito obrigatório.
- Dispatcher: seleção consultiva limitada, reserva sob lock/CAS com token; só lease
  de publicação expirada é recuperável. Aceite da Queue não significa envio.
- Consumer: payload Zod estrito, owner derivado da persistência, preflight de
  preferências/versão/fonte e reserva de entrega. Duplicatas sob estado RESERVED
  ou terminal não chamam o transporte. Revalidação precede chamada externa.
- Gmail: fetch HTTP, redirect:error, timeout token/send, MIME alternativo, endereços
  validados, HTML escapado e subject codificado. HTTP/rede/JSON inválido são erros
  sanitizados, sem retry. EMAIL_DELIVERY_ENABLED=false permanece padrão.
- Resumo: dia civil/fuso/horário, DST gap/fold reutilizados; anti-join exclui dia
  já planejado e serviço relê preferências. Dashboard usa ownership/calendário e
  overlap para eventos na meia-noite, com limites/truncamento explícitos.
- Histórico: sessão/CORS/no-store e GET sem mutação (CSRF não aplicável), filtros
  estritos, período semiaberto, paginação limitada, UUID e owner. Não expõe lease,
  token, destinatário, resposta Gmail ou ID externo. OpenAPI BE-019 preservado.

## Falhas e riscos remanescentes

| Fase | Política mantida |
|---|---|
| Antes de reservar entrega | Falha de leitura/preparação admite retry técnico limitado da Queue |
| Publicação/confirmar Queue | Lease de publicação recuperável, duplicatas toleradas |
| Depois de reservar, durante chamada | Não solicita retry de envio; grava FAILED se possível, categoria sanitizada |
| Depois do aceite, falha ao persistir | Mantém reserva/estado concorrente, log DELIVERY_UNCERTAIN, ack e reconciliação manual |
| Crash após reserva | Redelivery ignora reserva de entrega; pode perder envio antes da chamada, mas não autoriza repetição automática |
| Mudança durante chamada externa | Cancelamento não desfaz aceite Gmail; confirmação pode ser recusada e exige reconciliação |

Não existe exactly-once distribuído. Falhas NETWORK/FAILED podem representar um
aceite cuja resposta se perdeu; estado não permite reenvio automático. Log
operacional com categorias fixas/UUID é necessário se banco estiver indisponível.
SENT significa aceite do provedor, não entrega na caixa. Renovação não recupera
reserva de entrega nem reabre FAILED/CANCELLED/SENT. Consumer desabilitado mantém
ack/PUBLISHED histórico; habilitar depois não reprocessa automaticamente.

Persistem limites conhecidos: resumo até 20 itens/lista e atrasos de 30 dias;
anti-join de digest pode gastar posições com usuários em DST gap ou limite de
intenções; custo SQL e throughput não medidos. Cliente público de histórico pode
mostrar RESERVED sem conhecer motivo de incerteza: investigação permanece interna.
Nenhum endpoint de reenvio foi criado. PoC Gmail/OAuth/remetente autorizado continua
necessária; credenciais não foram solicitadas ou utilizadas.

## Roteiro de aceite integrado e produção

1. Em branch Neon de desenvolvimento autorizada, revisar/aplicar migrations
   versionadas, inclusive cursor. Não aplicar no setup/build ou em produção.
2. Dois usuários: criar regras/tarefas/eventos/publicações; editar/cancelar/arquivar,
   suspender/encerrar/versionar série e mudar preferências. Validar atomicidade
   domínio+intenção+log, FK/CHECK/unique, ownership e rollback de falha intermediária.
3. Dois clientes: disputar reserva/publicação/consumer e Cron com cursor; provocar
   timeout e falha do audit. Validar savepoint, rollback do cursor, wrap com mais de
   20 regras e renovação com relógio avançado. Medir duração/custo e backlog.
4. Ambiente Cloudflare autorizado: validar bindings principal/DLQ, lote/retry/ack,
   mensagens inválidas/duplicadas, publicação com resposta perdida e reconexão.
5. OAuth Gmail de teste autorizado: verificar remetente/alias, escopo mínimo,
   tokens expirados/revogados, rejeições e MIME longo. Só enviar a destinatários
   autorizados em execução futura explícita. Simular aceite e falha no banco e
   comprovar que redelivery não chama novamente o provedor.
6. Validar summary DST/dia local/meia-noite, tabela de histórico sem dados internos,
   logs sem segredos e recuperação manual de casos incertos sem reenvio implícito.

Produção requer essas evidências, revisão humana de migrations/configuração,
monitoramento de RENEWAL_FAILED/RENEWAL_LIMIT/DLQ/DELIVERY_UNCERTAIN, limites/cotas,
procedimento de reconciliação e autorização separada para publicação. Nada nesta
entrega comprova Neon, Cron/Queues ou Gmail reais.

Validação BE-020 nesta entrega: lint e typecheck aprovados; **603 testes em 36
arquivos** aprovados, zero skips locais (8 regressões novas). Build Wrangler
dry-run aprovado, sem upload. Prisma Client regenerado com APIs oficiais 7.10.1,
sem desativar TLS/checksum e sem alterar dependências/lockfile. OpenAPI anterior
idêntico à main; segurança e respostas das notificações conferidas. git diff
--check aprovado. Infraestrutura externa e migration real não executadas.
