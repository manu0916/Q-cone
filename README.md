# Q’Cone

Site estático com HTML, CSS e JavaScript. Inclui os sabores morango e maracujá, cinco fotos por sabor, ondas animadas, seleção de quantidade e resumo da encomenda.

## Publicar no Cloudflare Pages usando Git

1. Extraia o ZIP em uma pasta.
2. Suba o conteúdo dessa pasta no seu repositório. A pasta `public` deve ficar na raiz do repositório, junto deste README.
3. No Cloudflare, abra **Workers & Pages → Create application → Pages → Import an existing Git repository** e escolha seu repositório.
4. Configure:

| Campo | Valor |
| --- | --- |
| Framework preset | None |
| Production branch | main, ou o nome da sua branch principal |
| Build command | `node scripts/build-seo.mjs && node scripts/check-seo.mjs` |
| Build output directory | `public` |
| Root directory | deixe vazio |

5. Salve e publique. Os próximos pushes para a branch principal atualizam o site.

O build usa Node.js, sem dependências externas nem variáveis de ambiente. Os arquivos gerados já estão versionados em `public`, permitindo publicação estática direta.

## Contatos e preços

Edite **public/config.js**:

- `whatsapp`: código do país + DDD + número, somente dígitos. Para o Brasil, começa com `55`.
- `instagram`: nome do perfil, sem `@`.
- `products`: nome, descrição, preço e fotos de cada sabor.
- `siteUrl`: endereço público oficial usado no canonical, sitemap e compartilhamento.
- `seo`: título, descrição e cidade/UF de atendimento, quando confirmadas.

Após editar, execute `node scripts/build-seo.mjs` e `node scripts/check-seo.mjs` para atualizar e validar o catálogo estático e seus metadados.

Os dois sabores estão com valor de **R$ 14,00**. Os contatos estão em branco para você preencher com os dados da loja.

Com WhatsApp preenchido, o botão abre a conversa com a quantidade e o total prontos. Sem WhatsApp, o cliente pode copiar o pedido e enviar no direct. Com Instagram preenchido, também aparece um link para o perfil.

## Ver no computador antes de publicar

Na pasta do projeto, rode:

```sh
python3 -m http.server 8080 --directory public
```

Abra **http://localhost:8080**. Também é possível abrir `public/index.html` diretamente; a cópia do pedido pode depender das permissões do navegador.

## Estrutura

```text
public/
  index.html
  styles.css
  app.js
  config.js
  favicon.svg
  assets/images/
```

Os arquivos publicados são os que estão dentro de `public`. Os caminhos são relativos, então o site também funciona quando servido em uma subpasta.

## SEO, GEO e prévia no WhatsApp

Configurados para **https://q-cone.pages.dev/**. Inclui catálogo no HTML, dados estruturados, Open Graph, Twitter Card, imagem social, sitemap, robots e perguntas frequentes. Veja [manutenção e validação](docs/seo.md). Ao migrar de domínio ou subpasta, atualize `siteUrl` e gere os arquivos novamente.

Referências oficiais: [sites estáticos](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/) e [integração com Git](https://developers.cloudflare.com/pages/configuration/git-integration/).
