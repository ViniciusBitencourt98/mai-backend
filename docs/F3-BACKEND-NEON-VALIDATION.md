# TASK-BE-011 — Fase 3: revisão Code First e roteiro Neon

## Resultado e ambiente

Execução em 2026-11-13, a partir de main em 827e0b3, na branch
test/BE-011-f3-neon-validation. Por orientação explícita do mantenedor, esta
execução adotou Code First: não configurar Neon, não solicitar credenciais, não
ler/escrever banco real e não executar migrations. DATABASE_URL, DIRECT_URL e
MAI_DATABASE_ENV estão ausentes. Nenhum ambiente PostgreSQL foi utilizado.

**A validação integrada Express/Workers → Prisma → Neon permanece pendente.**
Os resultados abaixo comprovam verificações locais de código, não persistência,
constraints, rollback ou concorrência em PostgreSQL. Não houve merge ou deploy.

BE-007, BE-008, BE-009 e BE-010 já estão implementadas na base: modelos Task,
Subtask, TaskRecurrence, TaskOccurrence, TaskOccurrenceEvent, Event,
EventRecurrence e EventException; DTOs Zod, controllers/rotas, services e
repositories Prisma reais. O calendário é uma projeção sem persistência própria.
Não foram duplicados modelos, endpoints ou motores de recorrência. Não houve
alteração de dependências, autenticação, schema ou contratos OpenAPI.

## Verificações executadas

| Verificação | Resultado |
|---|---|
| npm run lint | Aprovado |
| npm run typecheck | Aprovado |
| npm test | 318 aprovados em 21 arquivos; zero skipped |
| npm run build | Aprovado, Wrangler dry-run local |
| npm run test:integration, sem configuração de banco | 13 skipped em 7 arquivos; zero testes Neon executados |
| Migrations aplicadas | Nenhuma; não foi consultado o estado de nenhum banco |

O comando de integração foi usado apenas para confirmar a seleção skipped, após
verificar a ausência das variáveis e dos arquivos .env/.dev.vars. Os hooks que
conectariam ao Neon não foram executados. O build foi executado com
XDG_CONFIG_HOME=/workspace/.config e WRANGLER_SEND_METRICS=false; a opção
--dry-run já faz parte do script e não publica o Worker.

## Cenários e alcance da evidência

| Área | Evidência local | Pendente no banco/runtime completo |
|---|---|---|
| Tarefas/subtarefas | tests/tasks/tasks.test.ts: criação/edição, datas, status, completedAt, cancelamento do mestre, prioridades, projetos opcionais/próprios, filtros, paginação, ordenação e auth/CSRF | Persistência, FK/CHECK, concorrência de ordenação e HTTP com sessões reais |
| Recorrência de tarefas | tests/recurrence/recurrence.test.ts: DAILY/WEEKLY/MONTHLY/CUSTOM_DAYS, versões, suspend/resume/end, completar/reabrir ocorrência sem concluir futuras, histórico, ownership | Persistência das versões/estados e concorrência entre clients |
| Eventos | tests/events/events.test.ts: CRUD/arquivo, projeto opcional, filtros/paginação, overlap semiaberto, IANA e instantes UTC | FK/CHECK, persistência dos instantes e endpoint com sessão real |
| Recorrência de eventos | Mesma suíte: frequências, versões, exceções movidas, cancel/restore, pause/resume/end, DST gap/fold e clamp mensal | Persistência de exceções e concorrência de cancelamento |
| Calendário | tests/calendar/calendar.test.ts e domain-composition.test.ts: tipos, pontuais, recorrências, exceções, canceladas, versões, ownership, paginação offset, janela vazia e limites exatos | Consulta Prisma → Neon e HTTP autenticado com dois usuários reais |
| Timezone | UTC, Bahia, Nova York, Berlim, Auckland, Lord Howe e Tóquio; mudança de dia, meia-noite, fevereiro bissexto/não bissexto e meses com 28–31 dias | Mesmos casos no runtime conectado ao PostgreSQL |
| Transações | tests/database/phase3-transactions.test.ts: injeção isolada de falha em histórico de ocorrência, versão/exceção de evento e reordenação; falhas são aguardadas e propagadas na mesma chamada $transaction | Rollback real, isolamento e concorrência sob falha intermediária |

Os novos testes de composição usam CalendarService, RecurrenceService e
EventService reais, com seus motores existentes; somente a persistência é
isolada. Não são testes de integração Neon. Os testes de falha usam mocks Prisma
para verificar o contrato transacional; não simulam rollback para apresentá-lo
como evidência PostgreSQL.

Limites do calendário verificados nos dois lados da fronteira:

- Janela de exatamente 31 × 24 horas aceita; um milissegundo a mais rejeitado.
- 100 mestres por tipo aceitos; 101 rejeitados com CALENDAR_LIMIT/409.
- 10.000 itens expandidos aceitos, com última página válida; exceder o limite
  rejeita a consulta inteira. Candidatos cancelados também consomem o limite.
- Paginação implementada é page/limit (máximo 100), não cursor. O cursor after
  pertence à consulta de ocorrências de tarefas, não ao contrato de /calendar.

Ownership tem cobertura HTTP isolada nos módulos e cobertura dos predicados Prisma.
A composição garante que o owner da consulta é repassado aos dois domínios e que
o usuário B não recebe itens selecionados para A. Isso ainda não comprova duas
sessões reais sobre dados persistidos.

## Defeito encontrado e correção

localToday retornava anos sem quatro dígitos: por exemplo, um instante no ano
0001 resultava em 1-03-01. Os DTOs aceitam 0001–9999, portanto esse valor quebrava
a consulta de ocorrências e a comparação de datas civis do calendário. A função
agora preserva YYYY-MM-DD. A regressão falhou antes da correção para 0001, 0099 e
0999, e passou depois, incluindo mudança de dia em Asia/Tokyo e ano moderno.

Foram adicionados 20 testes isolados: 11 de composição/data civil, 5 de limites e
4 de propagação de falhas transacionais. Nenhuma regra nova de recorrência.

## Revisão dos 13 testes Neon pendentes

| Arquivo em tests/integration | Casos | Cobertura prevista |
|---|---:|---|
| neon.integration.ts | 3 | Worker técnico local: persistência entre requests, commit e rollback de par de probes |
| projects.integration.ts | 1 | Persistência e isolamento de projetos |
| notes.integration.ts | 1 | Persistência, tags, FK e isolamento de notas |
| decupages.integration.ts | 2 | Persistência, ordem e concorrência de segmentos |
| tasks.integration.ts | 2 | Persistência de tarefas/subtarefas, CHECK/FK, ordenação e concorrência |
| recurrence.integration.ts | 2 | Versões, estado esparso, histórico e conclusão concorrente |
| events.integration.ts | 2 | UTC/overlap, versões/exceções e cancelamento concorrente |
| **Total** | **13** | **Todos skipped por decisão Code First/ausência de configuração Neon** |

Os testes de domínio reais usam Prisma diretamente; apenas a fixture técnica
exercita workerd com Neon. Não existe suíte Neon de calendário nem uma suíte
completa dos módulos via Express no workerd conectado ao banco. Executar os 13
casos existentes no futuro não encerra sozinho todos os cenários desta BE-011.

## Migrations revisadas

| Ordem | Migration versionada | Área |
|---:|---|---|
| 1 | 20261113000100_technical_probe | Probe técnico |
| 2 | 20261113000200_authentication | Usuários, preferências, sessões e throttle |
| 3 | 20261113000300_projects | Projetos |
| 4 | 20261113000400_notes | Anotações |
| 5 | 20261113000500_decupages | Decupagens/segmentos |
| 6 | 20261113000600_tasks | Tarefas/subtarefas, índices e CHECK/FK |
| 7 | 20261113000700_task_recurrence | Regras versionadas, estado e histórico |
| 8 | 20261113000800_events | Eventos, recorrência e exceções |

Revisão estática: scripts aditivos; não contêm DROP, TRUNCATE ou remoção de dados.
As constraints de posição são DEFERRABLE INITIALLY DEFERRED e permitem trocas de
ordem na transação. Não houve migration nova para BE-010 ou BE-011. Sem consultar
um banco, não é possível afirmar quais dessas migrations estão pendentes nele.

## Execução local futura com Neon

Este roteiro é para uma execução posterior autorizada pelo operador; nenhum dos
passos que usa banco foi realizado nesta entrega. Node >=22.13, npm e acesso ao
Neon/registries/CDN oficial do Prisma são necessários.

### 1. Configurar exclusivamente desenvolvimento

Conferir no painel Neon a branch de desenvolvimento autorizada e selecionar as
URLs pooled e direta da **mesma branch, banco e role**, com sslmode=require.
O guard local não consegue identificar produção remotamente: a conferência é
responsabilidade do operador. Não copiar credenciais para chat, Git ou frontend.

No repositório backend, copiar .env.example para .env e preencher:

| Variável em .env | Valor/finalidade |
|---|---|
| DATABASE_URL | URL PostgreSQL Neon pooled, host com -pooler; runtime/testes |
| DIRECT_URL | URL do mesmo endpoint sem -pooler; CLI/migrations |
| MAI_DATABASE_ENV | development; confirmação explícita do operador |
| AUTH_ENV | development |
| AUTH_PUBLIC_ORIGIN | http://localhost:8787 |
| AUTH_COOKIE_SECURE | false, permitido somente no loopback de desenvolvimento |
| AUTH_COOKIE_SAME_SITE | lax |
| CORS_ALLOWED_ORIGIN | http://localhost:5173 |

Copiar .dev.vars.example para .dev.vars e preencher DATABASE_URL e as mesmas
configurações AUTH_*/CORS. O Wrangler recebe DATABASE_URL por esse arquivo; não
depender de .env como binding. DIRECT_URL e MAI_DATABASE_ENV pertencem ao CLI,
não precisam estar no Worker. Ambos os arquivos são ignorados pelo Git.

### 2. Instalar, gerar e aplicar migrations existentes

No backend, depois de confirmar o destino de desenvolvimento:

```bash
npm ci
npm run prisma:generate
npm run prisma:validate
npm run prisma:migrate:status
npm run prisma:migrate:apply
npm run prisma:migrate:status
```

O postinstall já gera o client; a geração explícita torna a etapa visível. Aplicar
as migrations existentes em ordem pelo Prisma, nunca por SQL manual fora de seu
histórico. prisma:migrate:apply usa prisma migrate deploy após o guard local:
**aplica migrations no banco, não publica o Worker**. Não usar db push, reset ou
aceitar sugestões destrutivas. Não é necessário migrate dev para iniciar a base.

Se o CDN binaries.prisma.sh estiver bloqueado, seguir o diagnóstico em
[PRISMA-NEON-LOCAL.md](PRISMA-NEON-LOCAL.md); não desabilitar TLS/checksums. A geração
local do client desta máquina já foi preparada pelo procedimento oficial descrito
nesse documento. O CLI padrão de migrations ainda precisará estar operacional
na máquina que executar o roteiro.

### 3. Criar a primeira conta local

Não existe cadastro público. Em banco de desenvolvimento sem usuários, fornecer
um JSON {name, email, password} via stdin a npm run auth:bootstrap, preferencialmente
a partir de um gerenciador de senhas. Senha de pelo menos 15 caracteres. Uma opção
interativa com Python 3, sem senha no histórico ou arquivo:

```bash
python3 -c '
import getpass, json, sys
def ask(label):
    print(label, file=sys.stderr, end="", flush=True)
    return sys.stdin.readline().strip()
print(json.dumps({"name": ask("Nome: "), "email": ask("Email: "),
                  "password": getpass.getpass("Senha (minimo 15 caracteres): ")}))
' | npm run auth:bootstrap
```

O bootstrap é restrito à primeira conta: falha se já houver usuário. Se a branch
já tem contas, usar uma conta de teste existente. Para os futuros cenários de dois
usuários, as suítes Neon criam e limpam seus próprios usuários sintéticos; não
enfraquecer o bootstrap nem criar um endpoint público para isso.

### 4. Iniciar backend e frontend

Terminal 1, no backend:

```bash
npm run dev -- --port 8787
```

GET http://localhost:8787/health é liveness e não verifica banco. As rotas reais
estão na raiz: /auth/*, /tasks, /events e /calendar, sem /api/v1. Contrato completo
em [openapi.json](openapi.json) e [API.md](API.md).

Terminal 2, no repositório separado mai-frontend, copiar .env.example para .env e
definir apenas VITE_API_BASE_URL=http://localhost:8787; então:

```bash
npm ci
npm run dev -- --host localhost --port 5173 --strictPort
```

Abrir http://localhost:5173 e fazer login. Usar localhost em ambos os lados, sem
misturar com 127.0.0.1. O cliente existente envia cookies com credentials: include;
as mutações usam X-CSRF-Token do login/me e Origin permitido. Nenhuma URL ou senha
Neon pode receber prefixo VITE_. Reiniciar os processos após mudar configurações.
A agenda depende da versão do frontend que incorpora FE-013; ela não é alterada
por esta branch backend.

### 5. Retomar validação real em outra execução

Após nova autorização explícita para os dados sintéticos de teste na branch
conferida, executar npm run test:integration. Não há migrations automáticas nesse
comando. Falhas de conexão/schema com configuração presente devem falhar o run,
não virar skip. As suites limpam somente os próprios registros; conferir resíduos
se a rede falhar no cleanup.

Além dos 13 casos existentes, validar os módulos completos via Express/workerd e
duas sessões reais: GET/PATCH/archive/restore, regras e ocorrências; calendário
com tipos/overrides/overlap, paginação e limites; falhas intermediárias e rollback;
UTC, IANA, DST, meia-noite, fim de mês e fevereiro. Registrar a branch Neon usada,
migrations realmente aplicadas e resultados, sem connection strings.

## Pendências e diferenças do contrato

- A decisão Code First adia todos os gates externos, sem bloqueio de código.
- Ocorrências de tarefas atualmente oferecem complete/reopen, não cancel/restore
  individual. Cancelamento de tarefa é status CANCELLED no mestre; cancel/restore
  individual existe para eventos. O cenário literal de cancelamento individual de
  tarefa da BE-011 exige decisão de produto/contrato futura; não foi criado um
  endpoint ou novo estado sob uma tarefa de validação.
- Séries pausadas/encerradas retornam apenas estados/exceções salvos; versões
  antigas são histórico e não voltam a gerar ocorrências virtuais. O calendário
  exclui mestres arquivados, tarefas CANCELLED e ocorrências de eventos canceladas.
- Atomicidade real, migrations aplicadas e compatibilidade Prisma → Neon no
  runtime completo não podem ser declaradas aprovadas nesta execução.
