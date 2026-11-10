import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicDir = path.join(root, 'public');
const context = vm.createContext({ window: {} });
for (const file of ['config.js', 'catalog-template.js']) {
  vm.runInContext(await readFile(path.join(publicDir, file), 'utf8'), context);
}
const config = context.window.QCONE_CONFIG;
const url = new URL(config.siteUrl);
if (url.protocol !== 'https:' || url.search || url.hash) throw new Error('siteUrl deve ser uma URL HTTPS sem query ou fragmento.');
const base = url.href.endsWith('/') ? url.href : `${url.href}/`;
const absolute = value => new URL(value, base).href;
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const json = value => JSON.stringify(value, null, 2).replace(/</g, '\\u003c');
const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const { title, description, city, region } = config.seo;
const shareImage = absolute('assets/images/qcone-social.jpg');
const instagram = String(config.instagram || '').trim().replace(/^@/, '');
const phone = String(config.whatsapp || '').replace(/\D/g, '');
const faqs = [
  ['Quais são os sabores da Q’Cone?', `Os sabores são ${config.products.map(p => p.name.toLowerCase()).join(' e ')}. As duas opções têm casquinha crocante, brigadeiro branco e cobertura de chocolate branco.`],
  ['Quanto custa cada cone?', config.products.map(p => `${p.name}: ${money(p.price)} por unidade.`).join(' ')],
  ['Como encomendar?', `Escolha o sabor e a quantidade no catálogo. ${phone ? 'Use o botão para enviar sua encomenda pelo WhatsApp.' : 'Abra o resumo, copie a mensagem do pedido e envie pelo direct da Q’Cone.'} A encomenda fica confirmada depois da resposta do atendimento.`],
  ['Como combinar entrega, retirada e pagamento?', 'A data, a entrega ou retirada e a forma de pagamento são combinadas no atendimento. O total mostrado no catálogo corresponde aos produtos.'],
  ['Onde consultar ingredientes e alergênicos?', 'As descrições do catálogo apresentam os principais ingredientes. Antes de encomendar, consulte o atendimento sobre a composição completa, alergênicos e possíveis restrições alimentares.'],
];
const organization = {
  '@type': 'Organization', '@id': `${base}#organization`, name: config.name, url: base,
  logo: absolute('favicon.svg'), image: shareImage,
  ...(phone ? { telephone: `+${phone}`, contactPoint: { '@type': 'ContactPoint', telephone: `+${phone}`, contactType: 'customer service', availableLanguage: 'Portuguese', url: `https://wa.me/${phone}` } } : {}),
  ...(instagram ? { sameAs: [`https://www.instagram.com/${encodeURIComponent(instagram)}/`] } : {}),
  ...(city ? { areaServed: { '@type': 'City', name: city, ...(region ? { containedInPlace: { '@type': 'AdministrativeArea', name: region } } : {}) } } : {}),
};
const graph = {
  '@context': 'https://schema.org', '@graph': [
    organization,
    { '@type': 'WebSite', '@id': `${base}#website`, name: config.name, url: base, inLanguage: 'pt-BR', publisher: { '@id': organization['@id'] } },
    { '@type': 'CollectionPage', '@id': `${base}#webpage`, url: base, name: title, description, inLanguage: 'pt-BR', isPartOf: { '@id': `${base}#website` }, about: { '@id': organization['@id'] }, mainEntity: { '@id': `${base}#catalog` } },
    { '@type': 'ItemList', '@id': `${base}#catalog`, name: 'Cones por encomenda', numberOfItems: config.products.length, itemListElement: config.products.map((p, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@id': `${base}#${p.id}-product` } })) },
    ...config.products.map(p => ({ '@type': 'Product', '@id': `${base}#${p.id}-product`, name: p.name, url: `${base}#${p.id}`, description: p.description, image: p.photos.map(photo => absolute(photo.src)), brand: { '@type': 'Brand', name: config.name }, offers: { '@type': 'Offer', price: p.price.toFixed(2), priceCurrency: 'BRL', url: `${base}#${p.id}`, seller: { '@id': organization['@id'] } } })),
  ],
};
const head = `
  <title>${escape(title)}</title>
  <meta name="description" content="${escape(description)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta name="author" content="${escape(config.name)}">
  <link rel="canonical" href="${escape(base)}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="pt_BR">
  <meta property="og:site_name" content="${escape(config.name)}">
  <meta property="og:title" content="${escape(title)}">
  <meta property="og:description" content="${escape(description)}">
  <meta property="og:url" content="${escape(base)}">
  <meta property="og:image" content="${escape(shareImage)}">
  <meta property="og:image:secure_url" content="${escape(shareImage)}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Q’Cone — cones de morango e maracujá por encomenda">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escape(title)}">
  <meta name="twitter:description" content="${escape(description)}">
  <meta name="twitter:image" content="${escape(shareImage)}">
  <meta name="twitter:image:alt" content="Q’Cone — cones de morango e maracujá por encomenda">
  <link rel="preload" as="image" href="${escape(config.products[0].photos[0].src)}" fetchpriority="high">
  <script type="application/ld+json">${json(graph)}</script>
`;
const catalog = config.products.map((p, index) => `<article class="product" id="${escape(p.id)}" data-flavor="${escape(p.id)}" aria-labelledby="product-title-${escape(p.id)}">${context.window.QCONE_RENDER_PRODUCT(config, p, index)}</article>`).join('\n');
const content = `
      <section class="about-orders" id="como-encomendar" aria-labelledby="about-title">
        <h2 id="about-title">Conheça a Q’Cone</h2>
        <p>Cones cravejados de morango e maracujá por encomenda. Consulte os sabores, veja os recheios nas fotos e escolha a quantidade no catálogo.${city ? ` Atendimento em ${escape(city)}${region ? `, ${escape(region)}` : ''}.` : ''}</p>
        ${phone ? `<p><a href="https://wa.me/${phone}" target="_blank" rel="noopener noreferrer">Atendimento pelo WhatsApp</a></p>` : ''}
        ${instagram ? `<p><a href="https://www.instagram.com/${encodeURIComponent(instagram)}/" target="_blank" rel="noopener noreferrer">Instagram: @${escape(instagram)}</a></p>` : ''}
        <h2 id="faq-title">Dúvidas sobre as encomendas</h2>
        <div class="faq" aria-labelledby="faq-title">${faqs.map(([q, a]) => `<details><summary>${escape(q)}</summary><p>${escape(a)}</p></details>`).join('\n')}</div>
      </section>
`;
let html = await readFile(path.join(publicDir, 'index.html'), 'utf8');
for (const [name, value] of [['head', head], ['catalog', catalog], ['content', content]]) {
  const marker = new RegExp(`(<!-- seo:${name}:start -->)[\\s\\S]*?(<!-- seo:${name}:end -->)`);
  if (!marker.test(html)) throw new Error(`Marcador ausente: ${name}`);
  html = html.replace(marker, (_, start, end) => `${start}${value}${end}`);
}
await writeFile(path.join(publicDir, 'index.html'), html.replace(/[ \t]+$/gm, ''));
await writeFile(path.join(publicDir, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${absolute('sitemap.xml')}\n`);
// One canonical page; product fragments are not separate sitemap URLs.
await writeFile(path.join(publicDir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escape(base)}</loc></url></urlset>\n`);
await writeFile(path.join(publicDir, 'llms.txt'), `# ${config.name}\n\n> ${description}\n\n## Fonte oficial\n- [Catálogo e encomendas](${base}): sabores, preços e orientações de pedido.\n\n## Produtos\n${config.products.map(p => `- ${p.name}: ${money(p.price)} por unidade. ${p.description}`).join('\n')}\n\n## Encomendas\n${faqs.map(([q, a]) => `### ${q}\n${a}`).join('\n\n')}\n${city ? `\nÁrea de atendimento informada: ${city}${region ? `, ${region}` : ''}.\n` : ''}\nOs valores são dos produtos. Consulte o atendimento para confirmar disponibilidade, data, entrega ou retirada e pagamento.\n`);
console.log(`SEO e catálogo estático gerados para ${base}`);
