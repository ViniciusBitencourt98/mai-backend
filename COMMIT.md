# Commit inicial — mai-backend

## Mensagem recomendada

```text
docs(backend): preparar diretrizes e roadmap para Codex
```

## Como aplicar sem sobrescrever o projeto atual

Copie **o conteúdo desta pasta** para a raiz do repositório `mai-backend`. Confira diferenças e preserve código, configurações e secrets já existentes.

O arquivo `.github/workflows/ci.example.yml` é **um modelo inativo**. Não renomeie para `ci.yml` antes de conferir package manager e scripts reais.

```bash
git status
git diff -- AGENTS.md STYLE.md README.md docs/
git add AGENTS.md README.md docs/ COMMIT.md README-CODEX-SETUP.md .env.example
# Se aplicável, adicione o STYLE.md e o template de PR:
git add STYLE.md .github/pull_request_template.md .github/workflows/ci.example.yml
git diff --cached --stat
git diff --cached
git commit -m "docs(backend): preparar diretrizes e roadmap para Codex"
git push origin main
```

Antes do push, confirme que não há `.env` com valores reais, tokens ou URLs com senha. Em repositórios com `main` protegida, crie uma branch de documentação e abra um PR em vez de fazer push direto.
