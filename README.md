# Nexo — Landing page

Código completo da LP da Nexo: animações 3D, portfólio, formulário de contato, modal do WhatsApp, integração com CRM e rastreamento Meta.

## Enviar ao GitHub

Extraia este ZIP e envie o conteúdo da pasta `nexo-landing-page` para a raiz do repositório. Inclua também `.env.example`, `.gitignore` e `.openai/hosting.json`. Não envie o arquivo ZIP como substituto do código-fonte.

## Estrutura

- `public/`: página, estilos, scripts, fontes e imagens.
- `worker/index.js`: backend para receber leads e enviar ao CRM e à API de Conversões.
- `scripts/build.mjs`: empacotamento do projeto.
- `tests/`: verificações do formulário e rastreamento.
- `.env.example`: nomes das variáveis de configuração, sem credenciais.

## Build e testes

Requer Node.js 20 ou superior. O projeto não possui dependências npm.

```sh
npm test
npm run build
```

A saída é `dist/client/` para arquivos públicos e `dist/server/index.js` para o Worker.

## EasyPanel

O `Dockerfile` da raiz cria uma imagem Node.js pronta para o EasyPanel e expõe a aplicação na porta definida por `PORT` (padrão `3000`). Não é necessário informar outro caminho de Dockerfile ou comando de inicialização.

Configure no EasyPanel as variáveis de `.env.example`. O servidor Node entrega os arquivos da landing page e mantém ativos `/api/leads`, `/api/leads/config` e `/api/meta/events`.

## Hospedagem e integrações

Esta versão usa backend compatível com Cloudflare Workers e foi publicada pelo Sites. O backend espera o binding `ASSETS` para servir os arquivos de `dist/client/`. A configuração `.openai/hosting.json` identifica a publicação original no Sites; ela não contém credenciais.

Uma hospedagem apenas estática não executa `/api/leads` nem `/api/meta/events`. Para o EasyPanel, use a imagem Docker incluída no projeto.

Configure no servidor as variáveis de `.env.example`: `META_PIXEL_ID`, `META_GRAPH_VERSION`, `META_ACCESS_TOKEN`, `WHATSAPP_NUMBER`, `CRM_WEBHOOK_URL`, `CRM_FUNNEL_ID` e, se exigido pelo CRM, `CRM_WEBHOOK_TOKEN`. Use o número comercial configurado para a Nexo em `WHATSAPP_NUMBER`. O `CRM_WEBHOOK_URL` deve apontar para `/api/crm/webhook/form?clientId=...` da Nexo; `CRM_FUNNEL_ID` deve ser o funil desse mesmo cliente. Sem os dois, o formulário permanece indisponível.

Nunca publique tokens ou a URL privada do webhook no GitHub nem no JavaScript do navegador. As respostas do formulário seguem para o CRM; o redirecionamento ao WhatsApp usa uma mensagem genérica, sem as respostas.

## Desempenho da experiência 3D

O 3D é carregado após a primeira pintura da página e respeita economia de dados e movimento reduzido. Peças estáticas são agrupadas mantendo os mecanismos animados separados. A resolução do canvas é limitada por aparelho; texto e interface continuam na resolução normal. A animação pausa fora da hero, reutiliza sombras após a entrada e prepara os shaders antes de exibir o canvas.

`npm run build` também gera Brotli/gzip e um manifesto de cache em `dist/server/assets.json`. Publique o `dist` completo ou reconstrua o Dockerfile. O servidor Node entrega os arquivos comprimidos e responde `304` quando o conteúdo não mudou. Ao alterar módulos JS/CSS versionados, atualize os parâmetros `?v=` no HTML e nos imports correspondentes.

Verificação: `npm test`. Os testes cobrem preservação da geometria agrupada, reversibilidade do percurso, orçamento de peças, compressão e os fluxos existentes de leads e conversões. A taxa de quadros deve ser verificada em aparelhos com WebGL real; contagem de peças e bytes não equivalem a uma medição de FPS.

## Rolagem da página

O cabeçalho, a barra de progresso e as seções compartilham um único agendamento por frame. As dimensões ficam em cache e são recalculadas quando o layout muda. Seções fora da tela estabilizam no primeiro/último estado; a faixa verde usa transformação em vez de alterar a altura durante o scroll. O cabeçalho usa fundo sólido para evitar recalcular desfoque sobre o canvas 3D.

A hero atualiza diretamente as camadas visíveis, sem propagar variáveis de animação por toda a árvore. O portfólio fica em fluxo normal da página (quatro cases com a tela completa de cada site), sem área fixa nem script próprio. `tests/scroll.test.mjs` verifica leituras de layout, agrupamento de eventos, movimento reduzido e retorno das animações ao rolar para cima. A rolagem continua nativa.

## Filme controlado pela rolagem

A exibição principal usa 384 imagens WebP independentes extraídas diretamente do master convertido para 4K pela Kie.ai. Preserva as duas cenas aprovadas, o cofre, os lasers, o ouro e os quatro capítulos de texto. O desktop tem quadros de 3840×2160. O celular usa um recorte móvel de 1440×2160, preservando toda a altura do master; o recorte anterior de 1080×1080 fica apenas no fallback MP4.

`hero-video.js` envia o progresso para `hero-sequence-worker.js`. O worker prepara e desenha os quadros em OffscreenCanvas; navegadores sem essa opção usam o mesmo renderizador no canvas principal. A rolagem permanece nativa. Imagens vizinhas são mescladas durante o movimento, sem modificar o corte entre os dois clipes. A fonte mantém seus 24 fps; mesclar imagens não cria detalhes novos de movimento.

Os quadros são agrupados em pacotes com um manifesto de offsets. Uma sequência leve permite responder a saltos e inversões enquanto os quadros de alta resolução são carregados perto da posição atual, após uma breve estabilização da rolagem. A nitidez sobe quando o quadro em alta fica disponível, inclusive ao parar a rolagem. O canvas acompanha a densidade da tela até os limites do master. O carregamento é progressivo: não se baixa toda a sequência 4K antes de mostrar a primeira cena.

O cache de imagens decodificadas é limitado a 64 MiB em retrato e 160 MiB em paisagem; o cache comprimido usa até 40 MiB. Esses limites pertencem ao renderizador, não à memória total do navegador. Texturas antigas são liberadas explicitamente. Fora da hero, em abas ocultas e com movimento reduzido, o processamento para. Economia de dados preserva a imagem inicial. Se canvas/worker não funcionar, `hero-video-fallback.js` mantém o MP4 anterior e o suporte HTTP Range do servidor.

`tests/sequence.test.mjs` cobre ida e volta, interpolação, cortes, memória, rotação e integridade dos 384 quadros nas duas resoluções. `npm test` também cobre o fallback e os fluxos de contato/rastreamento. A comparação controlada em navegador foi realizada com ida e volta durante dez segundos, incluindo canvas 3840×2160 e 1080×2160. Medições em um navegador de teste não garantem o mesmo resultado em todo celular ou conexão.

### Quadros do celular

`assets/hero-sequence/mobile-v2/` guarda só o manifesto e os quadros leves (540×810) usados durante a rolagem; os quadros em 4K do celular continuam em `mobile-v1/` e o manifesto os aponta com caminho relativo. Decodificar os quadros leves custa metade do tempo dos antigos (720×1080), e o 4K só começa depois que os pacotes leves ao redor da posição atual chegaram. Para regerar, redimensione os quadros de `mobile-v1/high-*.bin` para 540×810 (WebP, qualidade 62), agrupe 48 por pacote e atualize `levels.preview` do manifesto.

