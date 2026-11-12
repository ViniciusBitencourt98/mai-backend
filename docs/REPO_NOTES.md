# Contexto do repositório mai-backend

Este é um **repositório Git independente**. O frontend é publicado na Vercel e o backend no Cloudflare Workers; o PostgreSQL é hospedado no Neon.

- Código neste repositório: **backend**. Não desenvolver arquivos de outro checkout.
- Tickets do backlog são globais: implementar apenas a parcela pertencente ao repositório atual. Indicar dependências cruzadas em PRs.
- A API é a fonte dos contratos; o frontend consome HTTP/OpenAPI. Não importar caminhos de outro repo.
- Nunca realizar merge/deploy/migration de produção por conta própria.
- As instruções deste arquivo prevalecem sobre referências legadas a monorepo nos documentos de contexto.
