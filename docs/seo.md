# SEO, GEO e compartilhamento

Endereço oficial: https://q-cone.pages.dev/

O HTML publicado contém o catálogo completo antes do JavaScript. A mesma função de renderização é usada na geração estática e no fallback do navegador. O JavaScript ativa galerias, quantidades e pedidos sem duplicar produtos.

Inclui título e descrição, canonical absoluto, Open Graph e Twitter Card, imagem social JPEG de 1200 × 630, idioma pt-BR, títulos semânticos, perguntas frequentes visíveis, JSON-LD (Organization, WebSite, CollectionPage, ItemList e Product com Offer), robots.txt, sitemap.xml e llms.txt factual. O arquivo 404.html permite que o Cloudflare Pages devolva 404 para caminhos inexistentes, evitando servir o catálogo como resposta 200 em qualquer URL. Não foram inventados endereço, disponibilidade, avaliações, frete ou prazo de entrega.

Para GEO, o foco é conteúdo acessível e informações consistentes sobre a marca e os produtos. O Google informa que as práticas de SEO também se aplicam às experiências de IA, sem marcação especial obrigatória: https://developers.google.com/search/docs/appearance/ai-features. O llms.txt é um recurso complementar e não garante leitura, indexação ou citações por IAs.

## Atualização

Edite `public/config.js` e execute:

```sh
node scripts/build-seo.mjs
node scripts/check-seo.mjs
```

Publique também os arquivos gerados. No Cloudflare Pages, use `node scripts/build-seo.mjs && node scripts/check-seo.mjs` como comando de build e `public` como saída. Os arquivos gerados também ficam versionados; a configuração anterior com `exit 0` continua servindo a versão já gerada.

Os campos WhatsApp, Instagram, cidade e UF continuam vazios até que os dados reais sejam informados. Ao preencher `seo.city` e `seo.region`, o build gera a área atendida no texto visível e na entidade da organização. Só declare a área que a loja realmente atende. Um endereço físico e coordenadas só devem ser acrescentados quando forem confirmados.

## Após o deploy

1. Verifique os endereços `/robots.txt`, `/sitemap.xml` e `/assets/images/qcone-social.jpg` no domínio oficial.
2. Cadastre/verifique a propriedade no [Google Search Console](https://search.google.com/search-console) e envie `sitemap.xml`. Essa etapa requer acesso à conta do proprietário.
3. Use o [Schema Markup Validator](https://validator.schema.org/) para o grafo completo. O [Rich Results Test](https://search.google.com/test/rich-results) pode indicar que um catálogo com vários produtos não é elegível ao resultado enriquecido de produto individual. URLs próprias para produtos são uma evolução futura, se o catálogo crescer.
4. Confira a URL no [Sharing Debugger da Meta](https://developers.facebook.com/tools/debug/) e envie o link em uma conversa do WhatsApp. A prévia depende da plataforma e pode manter cache de versões anteriores.

As fotos do catálogo são WebP com dimensões explícitas, carregamento adiado nas fotos secundárias e prioridade alta para a primeira foto. Os PNGs originais foram preservados. A imagem de compartilhamento tem aproximadamente 137 KB.

## Imagem social

Arquivo: `public/assets/images/qcone-social.jpg`.

Criada com a ferramenta integrada de geração de imagens, usando as fotos existentes dos dois cones como referências de identidade. A saída foi ajustada para JPEG de 1200 × 630.

Prompt usado:

> Use case: ads-marketing. Create a polished horizontal social sharing cover for Q’Cone website, 1200x630 aspect ratio. The two attached images are product identity references: strawberry cone with white chocolate and red caramel bits, passion fruit cone with white chocolate and yellow caramel bits. Preserve these recognizable real products and appetizing appearance. Warm ivory background #fbf9f5, restrained soft red and yellow waves echoing the site's branding. Elegant large red italic serif wordmark EXACT text: “Q’Cone”. Smaller dark text EXACT: “Cones por encomenda”. Secondary text EXACT: “Morango e maracujá”. Composition: wordmark and text on left, two products on right, generous safe margins, all text readable in small WhatsApp previews. No prices, no phone numbers, no delivery claims, no invented packaging, no other text or watermark. Product photography integrated naturally into a minimal premium brand composition.

Referências: [Open Graph](https://ogp.me/) e [dados estruturados de produto](https://developers.google.com/search/docs/appearance/structured-data/product-snippet).
