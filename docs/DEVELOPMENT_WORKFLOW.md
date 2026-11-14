# Fluxo de desenvolvimento e continuidade

Política consolidada em TASK-DOC-BE-001. Escopo atual em [MVP_SCOPE](MVP_SCOPE.md);
estado verificável em [PROJECT_STATUS](PROJECT_STATUS.md). Não usar histórico de
chat como dependência para executar uma tarefa.

## Estratégia Code First

Implementar o recorte completo solicitado: DTOs, regras, serviços/repositories,
rotas, testes, contrato e migrations versionadas quando o ticket funcional exigir.
Preservar Express/TypeScript/Workers, Prisma/PostgreSQL Neon, React/Vite/TypeScript/
Tailwind, Cron + transactional outbox + Queues e adaptador Gmail. Mocks ficam nos
testes; não substituir persistência de produção por armazenamento fake para obter
checks verdes. Não adicionar dependência/stack ou serviço pago sem autorização.

Os agentes não precisam receber credenciais Neon. Não solicitar DATABASE_URL,
DIRECT_URL ou MAI_DATABASE_ENV como condição de implementação Code First. Ausência
de banco não bloqueia trabalho de código/testes isolados; registrar claramente o
que não foi executado. Isso não dispensa validação real antes do aceite integrado.
Não imprimir valores de variáveis/arquivos de credenciais nem salvá-los em docs.

Migrations são arquivos versionados no backend, revisados quanto a integridade,
compatibilidade e perda de dados. Não aplicar automaticamente, nem durante
install/build/test. Não executar migrations em produção. Uma tarefa exclusivamente
documental não altera código, contratos executáveis, testes, dependências ou migrations.

## Dois repositórios e ambientes Codex separados

- Backend: `ViniciusBitencourt98/mai-backend`, contrato HTTP, Prisma e serviços.
- Frontend: `ViniciusBitencourt98/mai-frontend`, interface e cliente do contrato.

Cada tarefa usa o checkout existente do seu repositório, em ambiente isolado.
Não converter em monorepo, criar apps/web/apps/api ou importar arquivos entre
checkouts. Não criar worktree sem solicitação explícita. Consulta ao outro repo
é permitida para conferir contratos/estado; modificações exigem tarefa/PR próprios.

Frontend e backend podem avançar em paralelo com IDs/branches/PRs separados.
Combinar primeiro campos, enums, datas, erros, paginação e segurança. Se a API
não estiver incorporada, preparar interface injetável/demo claramente identificada;
não apresentar demo como integração pronta. Registrar SHA/PR da dependência e
não depender implicitamente de branch não mesclada. PRs que mudem contrato avisam
o consumidor; merge manual na ordem das dependências e teste conjunto posterior.

## Contrato e rastreabilidade

[OpenAPI](openapi.json) é o contrato para endpoints implementados. Conferir também
DTOs, rotas e seções implementadas de [API](API.md); o catálogo inicial proposto
não autoriza inventar endpoints. Se houver divergência, registrar e corrigir em
tarefa explícita, sem mascarar no cliente. Validar o recorte alterado e exemplos;
não declarar todo o documento válido se existir defeito legado conhecido.

Usar IDs existentes F0–F6, TASK-BE/FE e os IDs de documentação. Não reutilizar um
número para outro assunto; tarefas novas sem ID aprovado ficam ligadas ao ID
funcional existente. O mapa em [NEXT_STEPS](NEXT_STEPS.md) reserva BE-013 e FE-016/017.
Atualizar o estado com evidências; não concluir ticket apenas pelo checkbox nem
marcar integração remota por sucesso de teste isolado.

## Branch, commit, PR e revisão

1. Conferir alterações locais e preservar trabalho existente; atualizar origin/main
   e criar branch por tarefa a partir dela. Usar nome solicitado pelo ticket;
   na ausência, `feat/BE-<ID>-<assunto>`, `fix/...`, `docs/...` ou `codex/<ID>-<slug>`.
2. Descrever o recorte e dependências, implementar apenas o autorizado e revisar
   o diff. Docs desta tarefa: `docs/DOC-BE-001-project-continuity`.
3. Conventional Commits: `feat(publications): ...`, `fix(calendar): ...`,
   `docs(project): ...`, `test(auth): ...`; citar o ID na mensagem/PR.
4. Executar os checks abaixo. Informar falhas, skips e não executados separadamente.
5. Commitar e enviar a branch; abrir PR para main com problema/resultado, escopo,
   arquivos, contrato/migrations, validação, riscos/pendências e dependências entre
   repos. Usar o template do repositório. Se GitHub retornar 403, deixar branch
   enviada, descrição pronta e link manual; não pedir outro token em chat.
6. Revisão e merge são manuais, pelo mantenedor. Agentes não fazem merge, force
   push na main, deploy automático nem habilitam envio real de e-mail.

## Checks e limites de evidência

Em cada raiz, respeitar versão Node/lockfile; `npm ci`, seguido de:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Backend usa Node 22.13+ (linha 22 em .nvmrc); frontend aceita linha 22 a partir de
22.12 ou 24+. Build backend é Wrangler dry-run, frontend gera dist: nenhum publica.
Se necessário neste ambiente cloud, usar cache npm/XDG em diretório gravável e
`WRANGLER_SEND_METRICS=false`. Ativações locais não substituem configuração versionada.

Testes de DTO/domínio, auth/ownership/CSRF, datas/fusos/recorrência, transações e UI
nos fluxos essenciais permanecem obrigatórios. Não remover/assertar menos para
passar. Cobertura extensiva além desses fluxos fica em V2; não exigir auditorias
ilimitadas como gate do MVP. Documentação valida links, consistência e diff também.

`npm run test:integration` (backend) exige configuração real e autorização;
sem URLs seus casos são skipped, não aprovados. Não executá-lo como prova de Neon
num agente sem banco. `test:remote` exige Worker de desenvolvimento publicado e
autorizado, não é parte automática do fluxo Code First. Não habilitar CI/deploy
nem alterar regras de branch neste ticket documental.

O bloqueio conhecido do CDN Prisma deve ser relatado; nunca desativar checksum,
assinatura ou TLS. Alternativa oficial usada na instância e limites constam em
[PRISMA-NEON-LOCAL](PRISMA-NEON-LOCAL.md). Evitar `.dev.vars` de cookies HTTP locais
na suíte Worker que usa origens HTTPS; seguir [TESTING](TESTING.md) e não apagar
configuração do usuário sem preservação.

## Validação real posterior na máquina do desenvolvedor

O desenvolvedor prepara sua branch Neon de desenvolvimento e configura valores
localmente, fora do Git/chat. Confere o alvo antes de migrations/usuário de teste;
segue [roteiro Fase 3](F3-BACKEND-NEON-VALIDATION.md) e
[roteiro Prisma](PRISMA-NEON-LOCAL.md), com autorização para escrita nesse banco.
Esta seção é orientação, não execução ou aprovação de uma migration.

Executar suites externas e frontend + API local, origens/cookies/CSRF corretos,
dois usuários, persistência após reload, desvinculação/arquivo, subtarefas/segmentos,
recorrências/exceções, fusos e calendário; depois publicações, dashboard e e-mails
quando implementados. Validar constraints/rollback/concorrência com PostgreSQL real.
E-mail só para destinatários de teste autorizados, sem retry automático de envio.

Registrar commit de cada repo, comandos/cenários, contagens, falhas/skips, resultado
observado e limpeza apenas de dados sintéticos próprios. Nunca copiar URLs com
credenciais. Smoke local não é smoke de produção; publicação e aceite hospedado
são ações posteriores explícitas do mantenedor.

## Como continuar este projeto em uma nova conversa ou agente

1. Identificar repo/ticket e inspecionar main atualizada; os SHAs em PROJECT_STATUS
   são um retrato datado, não substituem nova conferência. Ler AGENTS.md e README.
2. Ler PROJECT_STATUS, MVP_SCOPE, NEXT_STEPS e este workflow; em seguida BACKLOG,
   REQUIREMENTS, ARCHITECTURE, DATA_MODEL, API/OpenAPI, DECISIONS/ADRs e TESTING.
   Para UI, ler STYLE e as instruções locais do frontend.
3. Estado de partida: BE-012 e FE-015 incorporadas; publicações backend funcionais
   em código, UI editorial ainda demo/indisponível em modo real; calendário TASK/EVENT.
4. Próximas entregas: BE-013 e FE-016 podem avançar em paralelo; FE-017 aguarda
   contrato de calendário e integração editorial. Dashboard/notificações seguem o
   mapa de dependências. Não executar automaticamente o próximo ticket.
5. Preservar Code First, dois repos, testes essenciais e stack. Não solicitar
   credenciais, criar mock em produção, aplicar migrations reais ou publicar.
6. Entregar branch/commit/PR, checks reais e pendências. Atualizar evidência de
   estado sem declarar Neon/produção validados. Mantenedor revisa e mescla.
