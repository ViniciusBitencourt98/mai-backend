# ADR-001 — Autenticação por senha e sessão opaca

Estado: proposta implementada para revisão neste PR (F1-01–F1-04).
Escopo: backend Express/TypeScript, Prisma 7, PostgreSQL e Workers. Sem provedor
externo, OAuth, cadastro público, serviços pagos ou deploy. A indisponibilidade do
Neon não bloqueia os testes isolados; não significa persistência real comprovada.

## Decisão

E-mail normalizado para minúsculas e senha sem normalização. Senhas com salt
aleatório de 128 bits e PBKDF2-HMAC-SHA256, 600.000 iterações, saída de 256 bits;
formato versionado `pbkdf2-sha256$600000$<salt hex>$<hash hex>`. Usa `node:crypto`
com `nodejs_compat`, sem dependência nativa externa. O KDF real foi exercitado
no workerd local, inclusive validação inválida e conta inexistente. Nunca usar
PBKDF2 de poucas iterações apenas para contornar limites do runtime.

Primeira senha: pelo menos 15 codepoints; máximo 256 unidades UTF-16/1024 bytes.
O login aceita senhas menores para retornar falha de credenciais de forma uniforme,
sem obrigar um formato diferente entre usuários conhecidos e desconhecidos.
A verificação usa timingSafeEqual; contas inexistentes usam um hash dummy de
mesmo custo. Conta desabilitada, e-mail desconhecido e senha errada retornam o
mesmo 401. Isso reduz enumeração, sem prometer tempos HTTP idênticos.

Sessão com token aleatório independente de 256 bits em cookie HttpOnly, host-only,
Path=/; PostgreSQL armazena apenas SHA-256 do token, ligado à usuária. A validade
absoluta é 12 horas, sem renovação automática. Cada request privado consulta
sessão e usuária: expiração, revogação e conta desabilitada negam acesso.
Login bem-sucedido cria um token novo; se houver cookie anterior, a sessão antiga
é revogada na mesma transação de emissão. Logout revoga no banco antes de limpar
o cookie; falha de persistência não é relatada como logout bem-sucedido.

UserPreferences inclui timezone America/Bahia e e-mail desabilitado por padrão.
Apenas DTO público é devolvido; hashes e flags internas não são serializados.
O service depende de AuthRepository; Prisma está restrito à infraestrutura e
é desconectado ao fim de cada operação de request, conforme a fundação existente.

## Cookies, CORS e CSRF

Defaults HTTPS: `__Host-mai_session; Secure; HttpOnly; SameSite=Lax; Path=/`, sem
Domain. O prefixo impede cookies mais amplos de domínio nas implementações dos
browsers. Produção não deve ter cookies inseguros.

Para loopback local, configurar explicitamente em `.dev.vars`:

```dotenv
AUTH_ENV=development
AUTH_PUBLIC_ORIGIN=http://localhost:8787
AUTH_COOKIE_SECURE=false
AUTH_COOKIE_SAME_SITE=lax
CORS_ALLOWED_ORIGIN=http://localhost:5173
```

Secure=false só é aceito com ambiente development, public origin definido e
todas as origens em HTTP localhost/127.0.0.1/[::1]. Origens de auth exigem HTTPS fora do loopback de desenvolvimento. Origens inválidas ou
SameSite=None sem Secure fazem a configuração falhar. A porta/origem precisam
corresponder à execução real. Não copiar a configuração insegura para hospedagem.

Para frontend/API em sites diferentes (como Vercel e workers.dev), configurar
explicitamente `AUTH_COOKIE_SAME_SITE=none`, Secure=true e origens HTTPS exatas.
Browsers podem bloquear cookies de terceiros; preferir domínios do mesmo site
quando essa etapa de implantação for autorizada. Não há mudança automática de
SameSite baseada em headers não confiáveis.

CORS de `/auth/*` permite credentials apenas para origens exatas; o frontend deve
usar `credentials: 'include'`. O middleware de origem é obrigatório nos POSTs,
inclusive login (login CSRF). Requisições sem Origin também são rejeitadas.
PUBLIC_ORIGIN e a lista CORS são configurações de confiança do operador;
**nunca incluir origens que hospedem conteúdo de terceiros não confiável**.

Logout também exige X-CSRF-Token. O token CSRF é SHA-256 com separação de domínio
do segredo de sessão, entregue em login/me e comparado de forma segura no servidor.
Ele é recuperável a cada /me, mas não permite obter o token de sessão. Outra
origem não deve conseguir ler essa resposta por causa de CORS/SOP. Sem tokens em
URLs ou armazenamento persistente no browser. HttpOnly não protege contra todos
os efeitos de XSS; frontend ainda precisa tratar XSS e políticas de conteúdo.

Futuros POST/PATCH/DELETE privados devem aplicar autenticação, Origin e CSRF,
além de autorização de proprietário. As permissões CORS desses endpoints devem
ser explicitamente configuradas; esta entrega só habilita credentials em /auth/*.

## Controle de abuso e dados persistidos

AuthThrottle aplica buckets fixos de 15 minutos, no PostgreSQL, contando todos
os logins (inclusive corretos): 5 por e-mail e 20 por endereço por janela.
Os incrementos por upsert e a checagem ficam em transação, retornando 429 e
Retry-After=900 quando excedidos. Não resetar o contador só por login correto.
A janela fixa permite burst na borda; não substitui proteção DDoS/rate limiting
na borda nem defesa contra ataque distribuído. Um atacante pode causar negação
breve de login ao endereço conhecido; esse é um tradeoff do limite conservador
para o MVP de usuária única, sem lockout indefinido.

No entrypoint Worker, a origem do endereço é CF-Connecting-IP, definido pela
infraestrutura Cloudflare. Em ausência, há bucket conservador `unknown`. Não
reutilizar esse resolver em um servidor Node exposto diretamente: nesse caso usar
req.ip com trust proxy desabilitado ou uma configuração de proxies validada.
A aplicação genérica usa req.ip e não confia em X-Forwarded-For fornecido pelo cliente.

Chaves de throttle usam digest de e-mail/endereço + janela; são pseudônimos,
não anonimização garantida. O índice expires_at permite manutenção de retenção.
Sessões expiradas/revogadas e buckets antigos devem ser removidos por manutenção
administrativa autorizada. Não se criou cron/job neste PR. A expiração é validada
na leitura mesmo sem limpeza física das linhas. Não registrar credenciais,
cookies, tokens ou hashes em logs de erro, analytics ou dumps.

## Autorização por propriedade

`requireAuthentication` carrega AuthContext no servidor. `assertOwner` e
`requireOwnership` negam com 401 sem sessão e 403 para proprietário diferente.
O loader pode retornar null para 404, sempre depois de autenticar.
Futuros repositórios também precisam filtrar queries/mutações por userId da sessão,
validar propriedade de IDs estrangeiros e manter checks/transações de negócio
atômicos. Nunca aceitar userId do body como proprietário. Um middleware de sessão
sozinho não autoriza a leitura de registros de outra conta. Não foram criados CRUDs.

## Criar a primeira usuária (somente desenvolvimento autorizado)

Não existe endpoint público de cadastro nem senha inicial padrão. A ferramenta
`npm run auth:bootstrap` exige o guard de banco de desenvolvimento, schema migrado
e um objeto JSON recebido via stdin, sem argumentos de linha de comando com senha.
Ela valida o DTO, calcula o hash e executa via CLI Prisma uma transação com
advisory lock, recusando a operação se existir qualquer usuária. Cria preferências
na mesma transação. Não imprime SQL, hash ou falhas internas. Não cria usuários
em requests HTTP. A senha passa somente pelo stdin/memória do processo.

1. Conferir a branch Neon de desenvolvimento e configurar `.env` de forma segura,
   conforme PRISMA-NEON-LOCAL.md. Nunca usar banco de produção.
2. Gerar o client e aplicar as migrations versionadas nesse banco autorizado.
3. Enviar `{email, name, password}` por um gerenciador de senhas que exporte JSON
   para stdin. Alternativa interativa com Python 3 (não salva a senha ou a coloca
   no histórico de comandos):

```bash
python3 -c 'import sys,json,getpass
sys.stderr.write("Email: "); sys.stderr.flush(); email=input()
sys.stderr.write("Nome: "); sys.stderr.flush(); name=input()
password=getpass.getpass("Senha longa: ")
print(json.dumps({"email":email,"name":name,"password":password}))
' | npm run auth:bootstrap
```

Não colocar o JSON com senha no Git, scripts, variáveis de CI públicas ou logs.
A ferramenta não sobrescreve/resetta usuária existente. Recuperação de acesso e
provisionamento de produção exigem procedimento administrativo separado; não são
um endpoint público improvisado. Esta ferramenta não foi executada contra banco
real nesta entrega, pois a conexão não está disponível.

## Alternativas consideradas

- Argon2id: preferível em plataformas com suporte e memória adequados; node:crypto
  do Workers não oferece Argon2. Adicionar WASM e custo de memória/CPU exigiria
  uma PoC específica. Não trocar silenciosamente o algoritmo em produção.
- scrypt: possível com nodejs_compat, mas o custo de memória e concorrência por
  isolate precisa de medição. PBKDF2 foi exercitado com custo alto e baixo uso de memória.
- JWT no browser: revogação imediata e invalidação seriam mais complexas, sem
  benefício para este MVP; não armazenar tokens em localStorage.
- Provedor de identidade externo/OAuth: adiciona integração e configuração sem
  necessidade no MVP de usuária única; não incluído.

## Validação e pendências

Testes HTTP usam um repositório em memória injetado **somente nos testes**.
A aplicação usa exclusivamente o repositório Prisma; não há autenticação fictícia
ou fallback de usuário em memória na produção. Testes incluem KDF real em Node e
workerd, cookies, credenciais, CSRF, rate limiting, logout, expiração, revogação,
validação Zod e autorização de proprietário. OpenAPI descreve /auth/*.

Modelos/migration e SQL de bootstrap não foram aplicados/validados em PostgreSQL
real nesta entrega. A integração Neon, concorrência real dos upserts/transações,
login persistido e a PoC Cloudflare remota continuam pendentes. Não declarar esses
checks aprovados por testes fake. O custo de CPU do KDF e limites do plano Workers
precisam de medição remota antes de produção; sucesso no workerd local não prova
adequação à cota de CPU. Geração padrão do Prisma continua dependendo do CDN;
a instância foi validada com gerador oficial in-process, como documentado em
PRISMA-NEON-LOCAL.md, sem desativar checksum/TLS. Nenhum deploy ou merge foi executado.

### Evidências desta execução

Node 24.22.1 / npm 11.9.0 / Wrangler 4.161.0:

| Check | Resultado |
|---|---|
| Geração Prisma do schema atualizado | Gerador oficial 7.10.1 in-process/WASM, conforme procedimento já documentado |
| `npm run lint` | Passou |
| `npm run typecheck` | Passou, incluindo controllers, repositórios e ferramenta administrativa |
| `npm test` | 105 testes passaram em 12 arquivos; nenhum skip nessa suíte |
| KDF 600k no workerd local | Verificação correta, senha inválida, conta desconhecida e primitiva CSRF passaram |
| `/health` e negação de `/auth/me` sem cookie no workerd | 200 e 401, respectivamente |
| `npm run build` | Passou; dry-run, sem upload |
| `npm run test:integration` | 3 testes técnicos Neon skipped por ausência das URLs; sem validação PostgreSQL |
| `npm run auth:bootstrap` sem configuração de banco | Recusado pelo guard, sem escrita; teste positivo em PostgreSQL não executado |

Foi corrigida uma corrida no teardown dos testes Wrangler: gravações tardias de
logs podiam causar ENOTEMPTY. A remoção temporária usa tentativas limitadas;
asserções HTTP não foram desabilitadas ou substituídas por retries.
