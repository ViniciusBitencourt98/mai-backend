# fix(calendar): preserve civil years and verify Phase 3 composition (BE-011)

Datas civis anteriores a 1000 perdiam os zeros do ano em localToday, embora
aceitas pelos DTOs. A correção preserva YYYY-MM-DD e evita falhas na consulta de
ocorrências/calendário. A BE-011 segue o recorte Code First autorizado: revisão
local de funcionalidades já implementadas, sem acesso a Neon.

## Alterações

- src/tasks/dto.ts: preservar ano com quatro dígitos.
- tests/calendar/domain-composition.test.ts: composição CalendarService com os
  serviços/motores reais de recorrência e repositories isolados; conclusão,
  exceções/overlap/cancelamento, estados, versões, timezone, ownership e paginação.
- tests/calendar/calendar.test.ts: fronteiras exatas de 31 dias, 100 mestres por
  tipo e 10.000 expandidos, incluindo cancelados e combinação de tipos.
- tests/database/phase3-transactions.test.ts: propagação de falhas em transações
  dos repositories Prisma, com mocks isolados, sem alegar rollback PostgreSQL.
- docs/F3-BACKEND-NEON-VALIDATION.md: relatório, inventário Neon, revisão das oito
  migrations e roteiro local com variáveis, migrations, bootstrap e ambos os apps.
- README.md, docs/TESTING.md e docs/BACKLOG.md: referências e estado da entrega.

## Contratos e migrations

Sem novos endpoints, DTOs de transporte, mudança no OpenAPI ou schema. As
implementações reais Prisma de tarefas/eventos/recorrências/calendário foram
preservadas. Nenhuma migration criada/aplicada, leitura ou escrita em banco,
merge ou deploy. Frontend não é alterado por este PR.

## Validação

- Lint e typecheck aprovados.
- 318 testes locais aprovados em 21 arquivos; 20 novos; zero skipped locais.
- Build Wrangler dry-run aprovado.
- 13 testes Neon em 7 arquivos skipped por ausência de configuração e decisão
  Code First; zero testes reais Neon executados. Os hooks externos não rodaram.
- Regressão de ano civil reproduzida antes da correção.

## Limitações e pendências

Persistência, CHECK/FK, rollback e concorrência reais, HTTP autenticado completo
Express/workerd/Neon e calendário com dois usuários reais permanecem pendentes.
Os testes isolados não substituem esses gates. Não foram adicionadas regras
novas: tarefas oferecem complete/reopen por ocorrência; cancel/restore individual
pertence ao contrato de eventos. O roteiro documenta essa diferença da BE-011.
