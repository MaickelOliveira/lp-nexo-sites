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

Configure no servidor as variáveis de `.env.example`: `META_PIXEL_ID`, `META_GRAPH_VERSION`, `META_ACCESS_TOKEN`, `WHATSAPP_NUMBER`, `CRM_WEBHOOK_URL` e, se exigido pelo CRM, `CRM_WEBHOOK_TOKEN`. Use o número de WhatsApp da Nexo: `5544998168355`.

Nunca publique tokens ou a URL privada do webhook no GitHub nem no JavaScript do navegador. As respostas do formulário seguem para o CRM; o redirecionamento ao WhatsApp usa uma mensagem genérica, sem as respostas.

## Desempenho da experiência 3D

O 3D é carregado após a primeira pintura da página e respeita economia de dados e movimento reduzido. Peças estáticas são agrupadas mantendo os mecanismos animados separados. A resolução do canvas é limitada por aparelho; texto e interface continuam na resolução normal. A animação pausa fora da hero, reutiliza sombras após a entrada e prepara os shaders antes de exibir o canvas.

`npm run build` também gera Brotli/gzip e um manifesto de cache em `dist/server/assets.json`. Publique o `dist` completo ou reconstrua o Dockerfile. O servidor Node entrega os arquivos comprimidos e responde `304` quando o conteúdo não mudou. Ao alterar módulos JS/CSS versionados, atualize os parâmetros `?v=` no HTML e nos imports correspondentes.

Verificação: `npm test`. Os testes cobrem preservação da geometria agrupada, reversibilidade do percurso, orçamento de peças, compressão e os fluxos existentes de leads e conversões. A taxa de quadros deve ser verificada em aparelhos com WebGL real; contagem de peças e bytes não equivalem a uma medição de FPS.

## Rolagem da página

O cabeçalho, a barra de progresso e as seções compartilham um único agendamento por frame. As dimensões ficam em cache e são recalculadas quando o layout muda. Seções fora da tela estabilizam no primeiro/último estado; a faixa verde usa transformação em vez de alterar a altura durante o scroll. O cabeçalho usa fundo sólido para evitar recalcular desfoque sobre o canvas 3D.

A hero atualiza diretamente as camadas visíveis, sem propagar variáveis de animação por toda a árvore. O portfólio mantém camadas gráficas apenas para os projetos em apresentação. `tests/scroll.test.mjs` verifica leituras de layout, agrupamento de eventos, navegação nos quatro projetos, movimento reduzido e retorno das animações ao rolar para cima. A rolagem continua nativa.

## Hero em vídeo com rolagem

O vídeo da Nexo substitui o carregamento do WebGL. A rolagem nativa controla o tempo do vídeo nos dois sentidos e preserva os quatro capítulos de texto. As duas cenas aprovadas foram convertidas para 4K pelo Veo na Kie.ai, preservando o cofre, os lasers e o ouro. A sequência tem 16 segundos e 24 fps. O arquivo desktop tem 3840×2160; o celular recebe um recorte quadrado móvel de 1080×1080 derivado do mesmo master, mantendo o enquadramento anterior. Ambos usam H.264 sem áudio e início rápido. O desktop usa quadros-chave a cada seis frames; no celular todos os quadros são independentes para evitar decodificar imagens intermediárias a cada movimento do scroll. O arquivo original 4K fica preservado separadamente da exportação compactada para a página.

`public/hero-video.js` mantém apenas uma busca ativa e descarta alvos antigos quando a direção muda. Após `seeked`, oferece um ciclo de renderização ao compositor antes de pedir o próximo quadro. O controlador não executa um loop de espera enquanto decodifica e cancela apresentações pendentes ao sair da hero. O vídeo pausa fora da hero; economia de dados e movimento reduzido usam a imagem inicial. O servidor Node responde a requisições Range com 206, necessárias para buscas eficientes e compatibilidade com Safari.

Validação: testes automatizados de reversibilidade, faixas de bytes e fluxos existentes, inspeção da resolução e dos quadros do master. FPS em celulares reais não foi medido.
