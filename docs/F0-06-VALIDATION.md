# F0-06 — Validação Express/Workers em desenvolvimento

## Estado e pré-requisito F0-05

O PR #1 foi incorporado à `main` no commit
`19e7cf4c8134a26f40491e283251134446e9ef4b` (`Merge pull request #1`).
Seu head `ece6ea3b77f7ad18438936886dc8ea1974d1398b` é ancestral desse merge.
Verificação reproduzível: `git fetch origin` e
`git merge-base --is-ancestor ece6ea3b77f7ad18438936886dc8ea1974d1398b origin/main`.

**Resultado remoto: NÃO EXECUTADO.** Não concluir F0-06 nem o gate remoto com base
nos testes locais. O backlog permanece pendente até execução remota e revisão.

Impedimentos observados nesta execução:

- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_KEY` e
  `CLOUDFLARE_EMAIL` ausentes no processo; nenhum binding/identidade Cloudflare
  informado pelo ambiente gerenciado.
- `npx wrangler whoami` informou `You are not authenticated`. Não foi iniciado
  login interativo nem usada conta temporária sugerida pelo CLI.
- `curl -I https://api.cloudflare.com/client/v4/user/tokens/verify` falhou com
  `CONNECT tunnel failed, response 403` no proxy. Isso é recusa de rede, não
  evidência de token Cloudflare rejeitado.
- Conta e destino exclusivos de desenvolvimento ainda não fornecidos.

Antes de retomar, fornecer a conta e o destino autorizados e configurar a
credencial com segurança nas configurações do ambiente, nunca no chat, Git ou
logs. Um token deve permitir editar Workers apenas na conta de desenvolvimento
necessária. Não acrescentar permissões de banco, filas ou produção.
A rede precisa permitir `api.cloudflare.com` e o hostname exato do Worker
`<nome>-dev.<subdominio>.workers.dev`. Para criar PR pela API também é necessário
`api.github.com`. Manter os demais domínios já permitidos. Não desabilitar TLS.
Após aplicar os requisitos, repetir `whoami` e a conexão antes do deploy.

## Compatibilidade Node

A configuração principal e `wrangler.validation.jsonc` usam a mesma
`compatibility_date: "2026-11-12"` e `compatibility_flags: ["nodejs_compat"]`.
A data já habilita os módulos HTTP client (desde 2025-08-15) e HTTP server
(desde 2025-09-01). Não é necessário repetir as flags individuais.
`cloudflare:node.httpServerHandler` encaminha requests para `node:http` e Express;
`listen(3000)` na aplicação e `listen(3001)` na PoC são chaves virtuais do Workers,
sem servidor Node persistente ou listener TCP remoto.

A versão Node instalada na máquina de build não é a versão do runtime Workers.
Validar workerd local ajuda a detectar incompatibilidades, mas não substitui
o deploy e os requests remotos. Não alterar a data/flags sem repetir ambos.

Fontes oficiais consultadas:

- [HTTP no Workers](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/)
- [Flags de compatibilidade](https://developers.cloudflare.com/workers/configuration/compatibility-flags/)
- [Express no Workers](https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/)

## Isolamento da PoC

`src/index.ts` continua expondo somente as rotas da aplicação. As rotas abaixo
estão em `tests/fixtures/validation.worker.ts`, uma entrada separada:

| Método / caminho | Resultado esperado |
|---|---|
| `GET /health` | 200, JSON `{"status":"ok"}` |
| `HEAD /health` | 200 sem corpo |
| `POST /__validation/echo` | 201, mesmo JSON sintético recebido e requestId |
| `GET /__validation/error` | 500 genérico; não expor erro interno |
| `GET /__validation/async-error` | 500 genérico para Promise rejeitada |
| `GET /__validation/http-error` | 422 com código `VALIDATION_ERROR` |
| `GET /missing` | 404 JSON padronizado |

A fixture usa o parser, request ID, CORS e error handler reais da aplicação.
`createApp` aceita router adicional e métodos CORS específicos para a PoC,
sem mudar os defaults da aplicação. Somente a PoC permite POST no preflight.
Os testes verificam que a entrada principal retorna 404 para todas as rotas
`/__validation/*`. Não há autenticação, persistência, CRUDs ou serviços externos.
Usar somente os dados sintéticos da suíte; o echo não deve receber dados privados.

## Reprodução local (sem conta Cloudflare)

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run build:validation
```

Ambos os builds usam `--dry-run`, não enviam código ou criam recursos.
`npm test` inclui a suíte compartilhada em workerd local e testes da aplicação
original. A suíte remota está fora da seleção local, não é marcada como passed
ou skipped por `npm test`.

## Deploy exclusivo de desenvolvimento — quando desbloqueado

Confirmar no provedor que a conta informada é a conta autorizada e que o nome
escolhido não corresponde a Worker de produção ou a recurso de outra equipe.
O nome sugerido `mai-backend-f0-06-dev` é apenas um destino de exemplo até essa
confirmação. A conta vem do binding seguro `CLOUDFLARE_ACCOUNT_ID`; não inventar ID.
A configuração não contém account ID, secrets, routes, bancos, filas ou crons.
Não trocar a entrada principal para a fixture.

```bash
# Diretório de todos os comandos: raiz de mai-backend.
# Credencial e CLOUDFLARE_ACCOUNT_ID já injetados com segurança.
npx wrangler whoami
# Substitua pelo nome de desenvolvimento aprovado; mantenha o sufixo -dev.
MAI_DEV_WORKER_NAME='mai-backend-f0-06-dev'
npx wrangler deploy --config wrangler.validation.jsonc --env development \
  --name "$MAI_DEV_WORKER_NAME" --dry-run --outdir dist/validation
# Somente na conta e no destino de desenvolvimento autorizados:
npx wrangler deploy --config wrangler.validation.jsonc --env development \
  --name "$MAI_DEV_WORKER_NAME"
```

O último comando altera apenas o Worker de desenvolvimento aprovado. Não executar
`wrangler deploy` sem `--config` e `--env development`. Não usar conta temporária,
produção ou domínio de produção para contornar impedimentos. Se Wrangler solicitar
habilitar subdomínio/recursos não autorizados, interromper e registrar o requisito.

A configuração raiz da PoC não publica workers.dev; somente `env.development`
habilita esse endpoint, sem custom routes ou URLs de preview. Os nomes são
distintos de `mai-backend`. Não há script npm de deploy real automático.

## Testes remotos e evidência

Depois do deploy autorizado, usar a URL HTTPS exata emitida pelo Wrangler:

```bash
# Exemplo: substituir o subdomínio pelo real, sem paths, query ou credenciais.
export MAI_VALIDATION_URL='https://mai-backend-f0-06-dev.SUBDOMINIO.workers.dev'
npm run test:remote
# Opcional: resultado estruturado do run atual, fora do Git.
npm run test:remote -- --reporter=default --reporter=json \
  --outputFile=/tmp/mai-f0-06-remote.json
```

Em ambiente com proxy herdado, usar Node 24.5+ com suporte nativo ao proxy e
`NODE_USE_ENV_PROXY=1 npm run test:remote` (a máquina usada aqui tem Node 24.22.1).
Preservar proxy e CA herdados. Não remover o proxy para contornar a política.
O runner recusa URL ausente, HTTP, credenciais, paths e hosts fora do formato
`<nome>-dev.<subdominio>.workers.dev`; recusa redirects e tem timeout por request.
Essas checagens não substituem a confirmação de autorização do destino.
URL ausente faz a suíte falhar antes de enviar requests; isso não é teste remoto.

A mesma suíte de 12 casos exercita health, JSON UTF-8 aninhado, status 201,
HEAD, middlewares, erros sync/async, 422, 404, 400, 413, CORS e preflight 204.
Registrar no PR o SHA testado, conta/destino de desenvolvimento sem credenciais,
versão publicada retornada pelo Wrangler, horário e contagem dos testes.
Distinguir falha de conexão, autorização, asserção e checks não executados.
Não publicar dumps de ambiente, headers de autenticação ou payloads privados.

Após a PoC, remover somente o Worker descartável aprovado, quando não for mais
necessário, usando o mesmo `--config`, `--env development` e `--name`. Não remover
recursos já existentes de outras tarefas. Não promover esta fixture a produção.

## Evidência local desta entrega

Execução em Node 24.22.1 / npm 11.9.0 / Wrangler 4.161.0:

| Verificação | Resultado |
|---|---|
| `npm run lint` | Passou |
| `npm run typecheck` | Passou |
| `npm test` | 39 testes passaram em 4 arquivos; nenhum skip |
| `npm run build` | Passou; bundle principal, dry-run sem upload |
| `npm run build:validation` | Passou; bundle da PoC, dry-run sem upload |
| `npm run test:remote` sem URL configurada | Exit 1: `MAI_VALIDATION_URL is required; remote validation was NOT executed`; nenhum teste remoto executado |

O erro de pré-requisito do último comando não valida comportamento remoto e não
é incluído na contagem de testes aprovados. Nenhum deploy foi executado.
