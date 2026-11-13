# TASK-BE-002 — Prisma + Neon em desenvolvimento local

## Estado e escopo

Base: `main` em `120c2c3` (PR #2 incorporado). Apenas configuração e validação
local dos tickets F0-07/F0-08; nenhum projeto/branch Neon foi provisionado nesta
execução, pois não há conta ou credenciais disponíveis. Não marcar esses tickets
nem o gate remoto como concluídos. **A validação do Prisma no Cloudflare remoto
continua pendente.** Não houve deploy, migrations em banco real ou alteração de secrets.

Prisma CLI, Client e `@prisma/adapter-neon` estão fixados em 7.10.1.
O gerador `prisma-client` usa `runtime = "workerd"`, ESM e `engineType = "client"`:
client/compilador WASM, sem engine Rust nativa no Worker. `@neondatabase/serverless`
fornece conexões PostgreSQL por WebSocket através de `PrismaNeon`, com suporte a
transações interativas. Não usar `PrismaNeonHttp` para este teste de transação.
Mantidos `nodejs_compat` e a data 2026-11-12 na configuração Wrangler.

## Configurar uma branch Neon exclusivamente de desenvolvimento

1. No painel Neon, selecionar/criar uma branch de desenvolvimento autorizada,
   separada de produção. Não provisionar recursos pagos automaticamente.
2. Copiar as duas connection strings para **a mesma branch, banco e role**:
   pooled (`-pooler`) para `DATABASE_URL`; direta, sem `-pooler`, para `DIRECT_URL`.
   Manter `sslmode=require`. Nunca colocar credenciais no Git, chat ou logs.
3. Copiar `.env.example` para `.env` e preencher localmente os valores reais.
   `MAI_DATABASE_ENV=development` é uma confirmação explícita do operador, não
   consegue provar remotamente qual branch foi selecionada. Conferir isso no painel.
4. Para Wrangler, copiar `.dev.vars.example` para `.dev.vars` e acrescentar somente
   `DATABASE_URL` da branch de desenvolvimento. `DIRECT_URL` é exclusivo do CLI,
   não é binding do Worker. `.env` e `.dev.vars` são ignorados pelo Git.
5. No ambiente cloud, configurar valores de forma segura nas configurações do
   ambiente e garantir acesso ao endpoint Neon exato. Nunca pedir tokens de
   hospedagem Cloudflare para rodar localmente. Este ticket não precisa deles.

URLs com TLS desabilitado ou fora de `*.neon.tech` são rejeitadas pelo módulo de
configuração. Ao migrar, o guard também exige confirmação de desenvolvimento,
URL direta não pooled e correspondência de endpoint/banco/role com a URL runtime.
Isso reduz erros operacionais; não identifica sozinho bancos de produção.

## Instalação, geração e migrations

```bash
npm ci
npm run prisma:generate
npm run prisma:validate
```

O postinstall gera `src/generated/prisma/` automaticamente. O diretório é ignorado
pelo Git e lint, mas incluído pelo compilador/bundler. Geração/validação do schema
não requerem credenciais: `prisma.config.ts` só usa `DIRECT_URL` quando presente.
A execução de migrations requer a configuração de desenvolvimento acima.

A única migration versionada cria `technical_probes` com UUID, marker único e
created_at. Não contém tabelas de domínio, dados iniciais ou comandos destrutivos.

```bash
# Somente após conferir a branch Neon de desenvolvimento autorizada:
npm run prisma:migrate:status
npm run prisma:migrate:apply
# Para futuras alterações de schema, somente em desenvolvimento:
npm run prisma:migrate:dev -- --name nome_da_alteracao
```

`prisma:migrate:apply` executa `prisma migrate deploy` exclusivamente após o guard
de desenvolvimento: aplica migrations existentes no banco, não publica Worker.
`migrate dev` pode precisar de shadow database/permissões para criá-la. Não apontar
shadow/migrations para produção; preferir aplicar a migration versionada na branch
descartável desta PoC. Nenhuma migration é executada por install, build, dev ou testes.
Não há `db push`, `migrate reset` ou migration de produção automática.

## Conexões, injeção e operações

`src/infra/database/client.ts` constrói Prisma + adapter Neon sob demanda, usando
o WebSocket nativo. Não há Pool/Prisma global: `createPersistenceScope` cria client
por operação/requisição e sempre faz `$disconnect()` em `finally`. Limite de um
socket por scope e timeout de conexão de 10 segundos. Aguardar todas as operações
dentro do callback; não guardar o serviço fora desse scope.

O composition root `src/index.ts` injeta `createApplicationServices(env)` no app.
O container fica em `app.locals.services` e disponibiliza `withTechnicalProbes`.
Serviços usam a interface `ProbePersistence`; somente a infraestrutura conhece
Prisma. Controllers não importam Prisma nem URLs de conexão.

- `TechnicalProbeService.insert(marker)`: inserção técnica.
- `read(marker)`: consulta por marker.
- `insertPair(first, second)`: transação interativa com duas inserções.

Não há rotas públicas para estas operações. `/health` continua sendo liveness,
não abre conexão e funciona sem `DATABASE_URL`.

## Testes

```bash
npm run lint
npm run typecheck
npm test
npm run build
# Com desenvolvimento configurado e migration aplicada:
npm run test:integration
```

Os testes isolados verificam configuração sem vazamento de URLs, guard de migration,
injeção do repositório, limites de transação no serviço e lifecycle do client.
O fake em memória **não prova atomicidade PostgreSQL**.

`tests/integration/neon.integration.ts` inicia `wrangler.database.jsonc` localmente,
com fixture separada da entrada da aplicação. A suíte exige ambas as URLs e o
label de desenvolvimento antes de executar. Sem URLs, os três casos são skipped
explicitamente; não são contados como aprovados. Com configuração presente,
falhas de conexão, schema ou asserção fazem o run falhar, não viram skips.

Os casos reais inserem/leem por requisições independentes, verificam commit das
duas linhas e rollback quando a segunda inserção viola a unicidade de marker.
Usam prefixo UUID exclusivo e limpam somente registros desse prefixo no afterAll.
Se a rede cair durante cleanup, conferir resíduos `integration-<UUID>` antes de
reutilizar o banco; não executar exclusões amplas. Nenhuma migration roda no teste.
A fixture sanitiza falhas de banco e não deve ser importada na aplicação nem publicada.

A suíte usa o Worker **local**, mas Neon é um serviço PostgreSQL externo:
a conexão real ao banco de desenvolvimento ainda precisa de credencial e rede.
WebSocket do adapter usa o endpoint Neon; migrations por URL direta usam protocolo
PostgreSQL/TLS e podem precisar de acesso TCP específico no ambiente cloud.
Não desabilitar TLS nem contornar as regras de rede para conectar.

## Bloqueio do CLI e geração nesta máquina

O CLI 7.10.1 tenta baixar o schema-engine do CDN mesmo para `prisma generate`.
O proxy retornou 403 ao checksum de `binaries.prisma.sh`. O domínio foi adicionado
ao rascunho de rede do ambiente Codex, preservando os presets. Salvar as mudanças
nas configurações do ambiente e publicar esse ambiente Codex para reutilização;
isso é independente de deploy Cloudflare. Revalidar o acesso após a aplicação.
Não foram desativadas verificações de checksum, assinatura ou TLS.

Para concluir a validação de código nesta máquina, o client foi gerado com as
APIs oficiais `getGenerators` de `@prisma/internals@7.10.1` e
`PrismaClientTsGenerator` de `@prisma/client-generator-ts@7.10.1`, instaladas pelo
npm em `/tmp/mai-prisma-tooling`. Foi registrado o gerador in-process
`prisma-client` e usado o schema real, sem `skipDownload` ou overrides de engine.
O pacote generator espera assets no caminho de monorepo `node_modules/cli/build`;
um symlink temporário apontou para o pacote Prisma 7.10.1 já instalado, de onde
foram lidos os compiladores WASM verificados pelo npm. Nenhum código de dependência
ou arquivo gerado foi editado manualmente. Essa alternativa é apenas ferramenta
de validação da instância atual, não substitui o postinstall padrão versionado.

Assim, os checks atuais usam um client realmente gerado, mas `npm ci`/geração
padrão numa máquina nova ainda dependem da liberação do CDN. `prisma validate` e
operações CLI de migration seguem impedidas pela rede nesta instância até então.
Não declarar o setup padrão totalmente reproduzido enquanto o domínio permanecer
bloqueado. Os pacotes internos de geração não foram adicionados ao projeto.

## Limitações

Não há credenciais `DATABASE_URL`/`DIRECT_URL` nem `.env`/`.dev.vars` reais nesta
execução. F0-07 está preparado, sem provisionamento Neon comprovado. Consulta,
inserção, commit e rollback reais continuam pendentes. O build e a inicialização
no workerd demonstram que o bundle carrega, não que o adapter conectou ao Neon.
O runtime Cloudflare remoto continua pendente, sem deploy nesta tarefa.

## Evidências desta execução

Node 24.22.1, npm 11.9.0 e Wrangler 4.161.0:

| Verificação | Resultado |
|---|---|
| Geração do client por gerador oficial in-process, descrito acima | Passou; runtime workerd e compiler WASM da versão 7.10.1 |
| `npm run lint` | Passou |
| `npm run typecheck` | Passou, incluindo prisma.config.ts e suíte de integração |
| `npm test` | 59 passaram em 8 arquivos; inclui /health em workerd sem DATABASE_URL |
| `npm run test:integration` | 3 skipped; nenhum teste PostgreSQL executado |
| `npm run build` | Passou, bundle com Prisma, dry-run sem upload |
| Bundle da fixture de banco (`wrangler.database.jsonc --dry-run`) | Passou, sem publicar |
| `npm run prisma:generate` / `npm run prisma:validate` | Bloqueados: checksum do schema-engine recebeu 403 no proxy |
| `npm run prisma:migrate:status` | Recusado pelo guard: nenhuma configuração de desenvolvimento presente |

O resultado do guard não consulta o banco nem confirma o estado das migrations.
Os testes skipped e o CLI bloqueado não são relatados como aprovados.
