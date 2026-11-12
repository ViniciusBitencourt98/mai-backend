# Prompt de execução de task para Codex

> Copie e substitua `F0-01` pelo ID desejado. **Uma tarefa por execução**, respeitando dependências.

```text
Implemente exclusivamente o ticket F0-01 descrito em docs/BACKLOG.md.

Antes de alterar código, leia README.md, AGENTS.md, docs/REQUIREMENTS.md,
docs/ROADMAP.md, docs/ARCHITECTURE.md, docs/DATA_MODEL.md,
docs/API.md, docs/DECISIONS.md e STYLE.md se houver UI.

1. Confirme o ID, a descrição, as dependências e o critério de aceite.
2. Inspecione a base atual, identifique arquivos afetados e explique plano curto.
3. Respeite Express + TypeScript em Cloudflare Workers, não substitua por Hono.
4. Implemente o slice necessário sem modificar funcionalidades não relacionadas.
5. Inclua DTOs Zod, schema/migration, service, repository, rotas Express,
   frontend e testes conforme aplicável ao ticket.
6. Execute lint, typecheck, testes e build; documente resultados reais.
7. Atualize docs/DECISIONS.md para decisão nova, docs/API.md para contratos,
   exemplos de env e status da task quando de fato concluída.
8. Apresente resumo do que foi entregue, validação, riscos e próximo ticket
   desbloqueado. Se um requisito depender de decisão aberta, não invente
   comportamento irreversível: registre e proponha solução.
```
