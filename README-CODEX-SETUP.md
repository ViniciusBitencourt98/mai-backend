# Preparação do repositório backend para Codex Cloud

Copie os arquivos deste diretório para a raiz do repositório correspondente. Não substitua código existente sem revisar os conflitos.

## Passos do mantenedor
1. Confirmar que o Codex Cloud está conectado a este repositório GitHub e que o ambiente publicado instala dependências e passa nos checks.
2. Verificar os scripts existentes `lint`, `typecheck`, `test` e `build` no package.json. Ajustar CI, quando necessário, para nomes reais; **não gerar checks verdes falsos**.
3. Configurar workflow CI e branch protection na branch principal.
4. Configurar secrets apenas no provedor de hospedagem ou ambiente do Codex, com menor privilégio; não adicionar secrets em arquivos versionados.
5. Delegar um ticket por execução; revisar o PR; mesclar manualmente.

**Atenção:** dois repositórios separados exigem contrato e compatibilidade de API explícitos. Nunca alterar silenciosamente o outro repositório.
