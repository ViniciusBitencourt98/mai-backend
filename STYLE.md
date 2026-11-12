# STYLE.md — Design system inicial

## Direção visual
Interface profissional, clara e discreta para planejamento audiovisual. Priorizar legibilidade, densidade de informação equilibrada e velocidade de navegação. A agenda é o ponto de encontro de compromissos, tarefas e publicações; a cor deve ajudar a localizar, não competir com o conteúdo.

## Tipografia
- **Montserrat**: títulos de páginas, seções, cartões e destaques. Pesos 600 e 700.
- **Inter**: textos corridos, rótulos, botões, formulários, tabelas, descrições e números. Pesos 400, 500 e 600.
- Fallbacks: `Montserrat, Arial, sans-serif` e `Inter, system-ui, sans-serif`.
- Escala sugerida: H1 28/34 px, H2 22/28 px, H3 18/24 px; corpo 14–16/22–24 px; legenda 12/16 px.
- Não usar tudo em negrito. Preferir espaçamento e hierarquia.

## Paleta — proposta inicial (light mode)
| Token | Hex | Uso |
|---|---|---|
| `--color-primary` | `#315CFD` | Ações primárias, links e foco |
| `--color-primary-hover` | `#2449D4` | Hover em ação principal |
| `--color-background` | `#F7F8FB` | Fundo geral |
| `--color-surface` | `#FFFFFF` | Cards, formulários e painéis |
| `--color-surface-muted` | `#F0F3F8` | Fundos secundários |
| `--color-text` | `#182230` | Texto principal |
| `--color-text-muted` | `#536174` | Texto secundário |
| `--color-border` | `#DCE2EA` | Divisórias e bordas |
| `--color-success` | `#167D53` | Concluído, publicado |
| `--color-warning` | `#AA6800` | Prazo próximo, atenção |
| `--color-danger` | `#B42332` | Erro, atraso, exclusão |
| `--color-info` | `#2862B8` | Informações e eventos |

Cores são **ponto de partida**, a validar com a usuária em telas reais. Não depender só de cor para informar status: usar rótulo ou ícone.

## Cores semânticas da agenda
- **Evento/gravação:** azul (`--color-info`).
- **Tarefa:** neutro/índigo (`--color-primary`).
- **Publicação:** verde (`--color-success`).
- **Prazo crítico:** âmbar/vermelho conforme severidade.
- **Anotação/decupagem:** não precisa ocupar espaço na agenda sem data ou vínculo temporal.

## Componentes e comportamento
- Layout responsivo mobile-first; navegação lateral no desktop e navegação adaptada no celular.
- Espaçamento em múltiplos de 4 px: 4, 8, 12, 16, 24, 32.
- Cards: raio de 12 px; controles: 8 px; bordas discretas; sombras muito sutis ou nenhuma.
- Botões: primário, secundário, texto e destrutivo; estados hover, foco, carregando e desabilitado.
- Formulários: labels sempre visíveis, campos opcionais identificados, erros próximos ao campo.
- Listagens: filtros úteis por tipo, data, vínculo e texto; oferecer estados vazio, loading e erro.
- Agenda: visualizações diária, semanal e mensal, categorias legíveis e distinção entre evento com horário e tarefa com prazo.
- Ação de captura rápida para tarefa ou anotação, sem exigir projeto.
- Confirmação antes de ações destrutivas. Toasts não substituem mensagem persistente quando necessário.

## Acessibilidade
- Contraste de texto e componentes conforme WCAG AA sempre que possível; verificar combinações reais de fundo/texto antes de publicar.
- Suporte completo a teclado, foco visível e área de toque confortável (alvo sugerido: 44×44 px).
- Tipografia e layout devem funcionar com zoom de 200%.
- Animações discretas, respeitando preferência de movimento reduzido.

## Tokens CSS de referência
```css
:root {
  --font-heading: 'Montserrat', Arial, sans-serif;
  --font-body: 'Inter', system-ui, sans-serif;

  --color-primary: #315CFD;
  --color-primary-hover: #2449D4;
  --color-background: #F7F8FB;
  --color-surface: #FFFFFF;
  --color-surface-muted: #F0F3F8;
  --color-text: #182230;
  --color-text-muted: #536174;
  --color-border: #DCE2EA;
  --color-success: #167D53;
  --color-warning: #AA6800;
  --color-danger: #B42332;
  --color-info: #2862B8;
}
```

## Orientações para o Codex
- Consumir tokens de design, evitando hexadecimais espalhados pelos componentes.
- Antes de adicionar biblioteca visual, consultar as dependências existentes.
- Manter Montserrat somente em títulos e Inter nos demais elementos.
- Criar componentes reutilizáveis para badges de status, cards, filtros, campos e listas.
- Não inventar telas ou funcionalidades fora da tarefa solicitada.
