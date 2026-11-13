# F0-06 — Validação local Express/Workers

## Escopo e estado

Conforme a estratégia atual do Projeto MAI, esta entrega valida exclusivamente
o backend localmente. **A validação remota do F0-06 continua pendente** para
uma etapa posterior. Não concluir o gate remoto com base nesses resultados.
Não são necessárias credenciais Cloudflare, login ou configuração de hospedagem.
Nenhum deploy remoto, recurso de produção ou alteração de secrets foi realizado.
Não há Prisma, Neon, Queues, autenticação, e-mail ou CRUDs neste ticket.

O PR #1 foi incorporado à `main` no commit
`19e7cf4c8134a26f40491e283251134446e9ef4b` (`Merge pull request #1`).
Seu head `ece6ea3b77f7ad18438936886dc8ea1974d1398b` é ancestral desse merge.
Verificação reproduzível: `git fetch origin` e
`git merge-base --is-ancestor ece6ea3b77f7ad18438936886dc8ea1974d1398b origin/main`.
A implementação foi iniciada sobre essa main.

## Reprodução local

Pré-requisitos: Node.js 22.13+ e npm. Comandos na raiz de `mai-backend`:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run build:validation
npm run dev -- --ip 127.0.0.1 --port 8787
```

Em outro terminal:

```bash
curl -i http://127.0.0.1:8787/health
curl -i http://127.0.0.1:8787/missing
curl -i -H 'Origin: https://denied.example' http://127.0.0.1:8787/health
```

Resultados esperados: 200 com `{"status":"ok"}`, 404 JSON e 403 JSON,
respectivamente. Por padrão, origens de navegador são negadas. Para validar
origem permitida manualmente, usar `.dev.vars` conforme README, sem secrets.
O script `dev` já usa `wrangler dev --local`.

Os dois builds usam `wrangler deploy --dry-run`: apenas empacotam os arquivos,
sem upload, deploy, login ou criação de recursos. `npm test` inicia e encerra
workerd local automaticamente através de `unstable_dev` do Wrangler.

### Fixture local para parsing e erros

Como a API só implementa GET /health, uma fixture separada permite observar o
parsing de JSON e provocar falhas sem expor rotas artificiais na aplicação:

```bash
npx wrangler dev --local --config wrangler.validation.jsonc \
  --ip 127.0.0.1 --port 8788
```

Em outro terminal:

```bash
curl -i http://127.0.0.1:8788/health
curl -i -X POST http://127.0.0.1:8788/__validation/echo \
  -H 'Content-Type: application/json' -H 'Origin: https://mai.example' \
  --data '{"title":"Produção 🎬","nested":{"enabled":false,"count":0}}'
curl -i http://127.0.0.1:8788/__validation/async-error
curl -i -X OPTIONS http://127.0.0.1:8788/__validation/echo \
  -H 'Origin: https://mai.example' -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: Content-Type'
```

Resultados: 200, 201 com o mesmo JSON e requestId, 500 com mensagem genérica,
e 204 sem corpo, respectivamente. Enviar apenas dados sintéticos para o echo.
Encerrar as sessões Wrangler com Ctrl-C após a validação.

## Matriz automatizada

| Caso | Resultado esperado |
|---|---|
| `GET /health` | 200 e JSON mínimo; middleware remove X-Powered-By |
| `HEAD /health` | 200 sem corpo |
| `POST /__validation/echo` | 201; JSON aninhado, UTF-8, arrays, false, zero e null preservados |
| Erro síncrono / Promise rejeitada | 500 genérico, sem mensagem interna/stack |
| HttpError explícito na fixture | 422 e `VALIDATION_ERROR` |
| Rota ausente | 404 JSON padronizado |
| JSON inválido | 400 e `INVALID_JSON`, sem refletir corpo |
| JSON acima de 100 KiB | 413 e `PAYLOAD_TOO_LARGE` |
| Origem permitida | Origem exata refletida; `Vary: Origin` |
| Origem negada | 403 antes de executar rota; sem header de liberação |
| Preflight permitido | 204, métodos/headers explícitos e corpo vazio |
| IDs de requisição | UUID gerado no servidor, distinto por request |
| Isolamento | Rotas de fixture retornam 404 pela entrada principal |

`tests/app.test.ts` testa o pipeline HTTP em Node. `tests/worker.test.ts` testa
a entrada real `src/index.ts` em workerd. `tests/validation-worker.test.ts` usa a
fixture com o contrato compartilhado em `tests/shared/validation-contract.ts`.
`tests/validation-config.test.ts` verifica compatibilidade e isolamento das configs.
Os testes não dependem de credenciais nem enviam requests a Worker remoto.

## Compatibilidade Node e isolamento

A configuração principal e `wrangler.validation.jsonc` usam a mesma
`compatibility_date: "2026-11-12"` e `compatibility_flags: ["nodejs_compat"]`.
A data já habilita os módulos HTTP client (desde 2025-08-15) e HTTP server
(desde 2025-09-01). Não é necessário repetir as flags individuais.
`cloudflare:node.httpServerHandler` encaminha requests para `node:http` e Express;
`listen(3000)` na aplicação e `listen(3001)` na fixture são chaves virtuais do
Workers, sem processo Node persistente ou listener TCP no Worker.

A fixture está em `tests/fixtures/validation.worker.ts`; não é importada pela
entrada principal. `createApp` aceita router adicional e métodos CORS específicos,
mantendo os defaults atuais da API. Somente a fixture libera POST no preflight.
A configuração local tem nome próprio, sem env de deploy, custom routes,
workers.dev ou preview URLs habilitados. O bundle principal não contém
`/__validation/`. Nenhuma dependência foi acrescentada.

Fontes oficiais consultadas:

- [HTTP no Workers](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/)
- [Flags de compatibilidade](https://developers.cloudflare.com/workers/configuration/compatibility-flags/)
- [Express no Workers](https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/)

## Resultados e limites

Execução em Node 24.22.1 / npm 11.9.0 / Wrangler 4.161.0:

| Verificação | Resultado |
|---|---|
| `npm run lint` | Passou |
| `npm run typecheck` | Passou |
| `npm test` | 39 testes passaram em 4 arquivos; nenhum skip |
| `npm run build` | Passou; bundle principal, dry-run sem upload |
| `npm run build:validation` | Passou; bundle da fixture, dry-run sem upload |
| `wrangler dev --local` na aplicação | GET /health retornou 200 JSON |
| `wrangler dev --local --config wrangler.validation.jsonc` | GET /health 200; POST JSON UTF-8 201 com CORS permitido; erro async 500 genérico |

A versão Node da máquina de build não é a versão do runtime Workers.
workerd local demonstra a integração Express/adaptador local, mas não valida
roteamento, publicação ou comportamento da infraestrutura Cloudflare remota.
A API experimental `unstable_dev` está fixada pelo lockfile; upgrades exigem
revalidação. /health não consulta dependências externas. CORS não é autenticação.
O Wrangler pode usar um placeholder local para `Request.cf` quando a rede impede
buscar seus metadados; esta PoC não depende desse objeto.
O aceite remoto de F0-06 e o gate da fase 0 permanecem pendentes; o backlog não
foi marcado como concluído. A validação remota será planejada em tarefa posterior,
sem solicitar credenciais ou realizar deploy nesta entrega.
