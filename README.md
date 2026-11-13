# Projeto MAI — mai-backend

Repositório **backend** do Projeto MAI, aplicação web para organização da rotina de produção audiovisual e criação de conteúdo.

## Arquitetura

- **Frontend:** React + Vite + TypeScript, hospedado na **Vercel**.
- **Backend:** Express + TypeScript, hospedado no **Cloudflare Workers**.
- **Banco:** Neon PostgreSQL com Prisma no backend.
- **Jobs:** Cron Triggers + Transactional Outbox + Cloudflare Queues.
- **E-mail:** Gmail por adaptador (compatibilidade a validar).

Este repositório é **mai-backend**. Sua contraparte é outro repositório Git independente.

## Comece aqui

1. Leia `AGENTS.md` e `docs/REQUIREMENTS.md`.
2. Confira `docs/ROADMAP.md` e `docs/BACKLOG.md` antes de delegar tarefas.
3. Leia `docs/ARCHITECTURE.md`, `docs/API.md` e `docs/DECISIONS.md` antes de implementar.
4. Para desenvolvimento visual, siga `STYLE.md` (Montserrat em títulos, Inter em textos).
5. Use `COMMIT.md` para o commit de documentação e `README-CODEX-SETUP.md` para preparar o agente.

A fundação executável do backend está em `src/`; os documentos e templates continuam como referência do projeto. Não realizar deploy, merge ou migrations em produção automaticamente.


## Desenvolvimento do backend (F0-05 / TASK-BE-001)

Pré-requisitos: Node.js 22.13+ (linha 22 em `.nvmrc`) e npm. O runtime Workers
é executado localmente pelo Wrangler; não é necessário login Cloudflare, banco
ou credencial para estes comandos.

```bash
npm ci
npm run dev
```

Em outro terminal, `curl -i http://127.0.0.1:8787/health` deve retornar HTTP 200
e `{"status":"ok"}`. O script `dev` usa `wrangler dev --local`.

### CORS e configuração local

Por padrão, `CORS_ALLOWED_ORIGIN` está vazio: requisições com `Origin` são
rejeitadas com HTTP 403; clientes sem `Origin`, como curl e health checks,
continuam permitidos. CORS não substitui autenticação.

Para permitir o frontend local, copie `.dev.vars.example` para `.dev.vars`
(ignorado pelo Git). `CORS_ALLOWED_ORIGIN` aceita origens HTTP(S) exatas,
separadas por vírgula, por exemplo `http://localhost:5173,https://app.example.invalid`.
Não aceita `*`, `null`, paths ou barras finais. A resposta inclui `Vary: Origin`.
Preflight permite apenas `GET, HEAD, OPTIONS` e `Content-Type`, suficientes
para este bootstrap; futuros endpoints precisarão ampliar essa lista explicitamente.
Credenciais de navegador não são habilitadas nesta etapa.

O `.env.example` existente descreve integrações futuras. Prisma/Neon, autenticação,
filas e e-mail não são implementados nem necessários para iniciar este backend.
Não versione `.env`, `.dev.vars` ou segredos.

### Estrutura e runtime

- `src/index.ts`: entrada Worker e adaptador nativo `cloudflare:node`.
- `src/app.ts`: composição Express; `routes/`, `controllers/`, `services/` e
  `middlewares/` separam responsabilidades. Não há camada de persistência ainda.
- `src/errors/`: erros HTTP explícitos; falhas inesperadas retornam mensagem genérica.
- `tests/app.test.ts`: testes HTTP com Vitest e servidor Node efêmero.
- `tests/worker.test.ts`: Wrangler inicia workerd local e testa a entrada Worker real.
- `docs/openapi.json`: contrato apenas dos endpoints já implementados.

O adaptador oficial usa `node:http.createServer(...).listen(3000)` com
`httpServerHandler({ port: 3000 })`. **No Workers, 3000 é uma chave de roteamento
virtual**, não uma porta TCP nem um processo Node persistente. O único servidor
local de desenvolvimento é gerenciado pelo Wrangler. A compatibilidade está
fixada em `2026-11-12` com `nodejs_compat`, incluindo suporte HTTP server.
Referência: [HTTP no Workers](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/#httpserverhandler).

### Validação

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

`npm test` executa Vitest sem modo watch, incluindo workerd local. O teste de
runtime usa a API experimental `unstable_dev` do Wrangler, com versão fixada
no lockfile; atualizações dessa ferramenta exigem revalidar os testes.
`npm run build` produz o bundle em `dist/` com `wrangler deploy --dry-run`:
não faz upload, deploy ou migrations. O TypeScript é validado separadamente.

Erros seguem `docs/API.md`: `{ error: { code, message, details: [] }, requestId }`.
Todas as respostas recebem `X-Request-Id` gerado no servidor. Rotas inexistentes
retornam JSON 404, JSON inválido retorna 400, payload acima de 100 KiB retorna 413,
e falhas inesperadas retornam 500 sem mensagem interna ou stack.
O health check indica apenas que a API responde, sem verificar dependências externas.

### Limitações e próximos passos

A validação deste ticket é local. O aceite remoto de F0-05 e a PoC de F0-06
continuam pendentes de execução autorizada em ambiente Cloudflare de desenvolvimento.
Não há deploy de produção nesta entrega, nem scripts que o executem automaticamente.
O backlog permanece sem marcação de conclusão até revisão e validação remota.
A parte mínima de inicialização necessária à dependência F0-02 foi implementada
neste backend independente; não foi criado monorepo nem frontend.

## PoC de compatibilidade remota (F0-06)

O [roteiro F0-06](docs/F0-06-VALIDATION.md) descreve os pré-requisitos, a
configuração separada de desenvolvimento e a suíte reutilizável de validação.
`npm run build:validation` empacota a fixture sem deploy; `npm run test:remote`
exige a URL de um Worker de desenvolvimento previamente autorizado e publicado.
As rotas de echo e falha controlada ficam fora da entrada principal da aplicação.
A validação remota permanece bloqueada por configuração/permissões documentadas;
os testes locais não concluem o aceite remoto.
