import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const read = name => readFile(path.join(root, name), 'utf8');
const context = vm.createContext({ window: {} });
vm.runInContext(await read('config.js'), context);
vm.runInContext(await read('catalog-template.js'), context);
const config = context.window.QCONE_CONFIG;
const html = await read('index.html');
const base = config.siteUrl;
const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
assert.equal(schemas.length, 1, 'Um único grafo JSON-LD deve ser publicado.');
const graph = JSON.parse(schemas[0][1])['@graph'];
const products = graph.filter(node => node['@type'] === 'Product');
assert.equal(products.length, config.products.length);
assert.equal((html.match(/<h1\b/g) || []).length, 1);
assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
assert.ok(html.includes(`rel="canonical" href="${base}"`));
for (const property of ['og:title', 'og:description', 'og:type', 'og:url', 'og:image', 'og:image:width', 'og:image:height', 'og:image:alt']) {
  assert.ok(html.includes(`property="${property}"`), `${property} ausente.`);
}
assert.ok(html.includes(`property="og:image" content="${base}assets/images/qcone-social.jpg"`));
assert.ok(html.includes('name="twitter:card" content="summary_large_image"'));
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(ids.length, new Set(ids).size, 'IDs HTML devem ser únicos.');
for (const [index, p] of config.products.entries()) {
  assert.equal(products[index].name, p.name);
  assert.equal(products[index].description, p.description);
  assert.equal(products[index].offers.price, p.price.toFixed(2));
  assert.equal(products[index].offers.priceCurrency, 'BRL');
  assert.ok(html.includes(context.window.QCONE_RENDER_PRODUCT(config, p, index)), 'O catálogo estático deve refletir config.js. Execute o build.');
  for (const photo of p.photos) {
    assert.ok(photo.width > 0 && photo.height > 0, 'Imagens precisam de dimensões.');
    await access(path.join(root, photo.src));
  }
}
for (const match of html.matchAll(/<(?:img|script)\b[^>]*\bsrc="([^"]+)"/g)) {
  if (!match[1].startsWith('https://')) await access(path.join(root, match[1]));
}
for (const node of graph) {
  assert.ok(!node.aggregateRating && !node.review, 'Não publicar avaliações inventadas.');
}
const sitemap = await read('sitemap.xml');
assert.equal((sitemap.match(/<loc>/g) || []).length, 1);
assert.ok(sitemap.includes(`<loc>${base}</loc>`));
assert.ok((await read('robots.txt')).includes(`Sitemap: ${base}sitemap.xml`));
assert.ok((await read('llms.txt')).includes(base));
const jpeg = await readFile(path.join(root, 'assets/images/qcone-social.jpg'));
assert.equal(jpeg.readUInt16BE(0), 0xffd8, 'Imagem social deve ser JPEG válido.');
assert.ok(jpeg.length < 300000, 'Manter a imagem social abaixo de 300 KB.');
console.log(`SEO validado: ${products.length} produtos, HTML estático, preços, imagens, metadados, sitemap e robots.`);
