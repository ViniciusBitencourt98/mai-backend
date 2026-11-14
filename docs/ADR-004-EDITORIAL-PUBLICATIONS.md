# ADR-004 — Publicações editoriais (TASK-BE-012)

Estado: implementada como proposta para revisão neste PR. Recorte backend de
F4-01/F4-02 e RF-08; os gates Neon/remotos não são declarados concluídos.

## Valores e fluxo manual

- Plataformas: `INSTAGRAM`, `TIKTOK`, `YOUTUBE`, `FACEBOOK`, `LINKEDIN`, `OTHER`.
- Formatos: `SHORT_VIDEO`, `LONG_VIDEO`, `REELS`, `STORIES`, `CAROUSEL`, `IMAGE`,
  `TEXT`, `OTHER`. Plataforma e formato são obrigatórios na criação, sem matriz
  de combinações: uma plataforma pode receber qualquer formato editorial.
- Estados: `IDEA` (padrão), `PLANNED`, `IN_PRODUCTION`, `READY`, `PUBLISHED`,
  `CANCELLED`. Mudanças entre quaisquer estados são manuais e permitidas, inclusive
  correções/reabertura. Não existe aprovação obrigatória.

O esboço anterior de DATA_MODEL incluía SCHEDULED. Neste recorte, PLANNED e
scheduledAt representam o planejamento, sem um segundo estado de agendamento:
nenhuma operação programa ou publica conteúdo na rede. PUBLISHED somente resulta
de valor explícito enviado pela usuária; não prova execução por API externa.

Enums PostgreSQL/Prisma seguem os módulos existentes; OTHER atende classificações
fora do catálogo inicial. Extensões futuras são aditivas: adicionar valor no enum
via migration, atualizar DTO/OpenAPI e clientes, sem mudar a entidade/relacionamentos.
Não aceitar nomes arbitrários nem criar catálogos globais nesta tarefa.

## Datas e edição

scheduledAt e publishedAt são opcionais e independentes do status. Instantes ISO
com Z/offset, normalizados UTC, precisão até milissegundos, anos UTC 0001–9999;
armazenados em TIMESTAMPTZ(3). Não há timezone por publicação, data civil artificial
nem conversão em evento. Uma futura projeção de calendário poderá usar scheduledAt
e o fuso de exibição do usuário; `/calendar` permanece inalterado.

publishedAt é informado manualmente. Criar/mudar status nunca preenche, atualiza
ou limpa essa data automaticamente. PATCH omitindo um campo preserva seu valor;
null limpa opcionais. PUBLISHED pode não ter data conhecida, e desfazer o estado
pode manter a data histórica até remoção explícita. Não exigir relação temporal
entre data planejada e efetiva: publicação pode ocorrer antes ou depois do plano.

caption é a legenda/descrição única, notes são observações separadas, ambas texto
simples nullable de até 50.000 caracteres. externalUrl é referência HTTP(S) de até
2.000 caracteres; o backend não busca nem executa esse destino.

## Persistência, segurança e arquivo

Zero ou um projeto próprio, inclusive arquivado; projectId null permite registro
independente. FK composta (project_id,owner_id) preserva isolamento também fora do
serviço e em corridas com exclusão. RESTRICT não apaga publicações ao excluir um
projeto. Owner vem exclusivamente da sessão e participa de todas as consultas e
mutações; 404 para ausente/externo, CSRF/Origin em todas as mutações.

Arquivo é independente de CANCELLED, preserva os campos e é idempotente quanto
a archivedAt. Registros arquivados são consultáveis/editáveis e podem ser
restaurados; listagem os omite por padrão. Sem DELETE definitivo.

Filtros combinam por AND; janela planejada semiaberta [from,to), sem datas nulas.
Ordenação por scheduledAt (padrão asc) ou updatedAt; nulls sempre no fim e UUID
ascendente no desempate. Paginação offset limitada, sem snapshot concorrente.

Migration aditiva versionada, não aplicada. Validar persistência, enums, FKs,
filtros PostgreSQL e concorrência de arquivo em Neon de desenvolvimento futuro.
Rollback removendo tabela/enums perde dados e requer backup/decisão; sem execução
automática. Sem frontend, calendário, outbox, e-mail, deploy ou API social neste PR.
