"use strict";
// Shared by the static build and the browser fallback: one product template.
window.QCONE_RENDER_PRODUCT = function (config, product, productIndex) {
  const photos = product.photos;
  const id = String(product.id).replace(/[^a-z0-9-]/gi, "").toLowerCase();
  const instagram = String(config.instagram || "").trim().replace(/^@/, "");
  const money = value => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  function icon(name, size = 17) {
    const paths = {
      minus: '<path d="M5 12h14"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      left: '<path d="m15 18-6-6 6-6"/>',
      right: '<path d="m9 18 6-6-6-6"/>',
      check: '<path d="m20 6-11 11-5-5"/>',
      copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    };
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
  }

  function waves() {
    return `<div class="flavor-waves" aria-hidden="true">${["back", "middle", "front"].map(layer => `<svg class="flavor-wave flavor-wave-${layer}" viewBox="0 0 2880 180" preserveAspectRatio="none" focusable="false"><path d="M0 80 C240 20 480 20 720 80 S1200 140 1440 80 S1920 20 2160 80 S2640 140 2880 80 V180 H0 Z"/></svg>`).join("")}</div>`;
  }

    return `${waves()}
      <section class="gallery" aria-label="Fotos de ${escapeHTML(product.name.toLowerCase())}" aria-roledescription="carrossel">
        <div class="gallery-window">
          <div class="photo-track" tabindex="0" role="group" aria-label="Galeria de ${photos.length} fotos. Deslize para o lado ou use as setas do teclado.">
            ${photos.map((photo, index) => `<div class="photo-slide" role="group" aria-roledescription="slide" aria-label="Foto ${index + 1} de ${photos.length}"><img src="${escapeHTML(photo.src)}" alt="${escapeHTML(photo.alt)}" width="${photo.width}" height="${photo.height}" decoding="async" draggable="false" loading="${productIndex === 0 && index === 0 ? "eager" : "lazy"}" fetchpriority="${productIndex === 0 && index === 0 ? "high" : "auto"}"></div>`).join("")}
          </div>
          <button class="gallery-arrow previous" type="button" aria-label="Foto anterior" disabled>${icon("left", 20)}</button>
          <button class="gallery-arrow next" type="button" aria-label="Próxima foto">${icon("right", 20)}</button>
        </div>
        <div class="gallery-navigation"><div class="gallery-dots" aria-label="Escolher foto">${photos.map((_, index) => `<button type="button" aria-label="Ir para foto ${index + 1} de ${photos.length}" ${index === 0 ? 'aria-current="true"' : ""}><span></span></button>`).join("")}</div><span class="photo-count" aria-live="polite" aria-atomic="true">1 / ${photos.length}</span></div>
      </section>
      <section class="product-info" aria-labelledby="product-title-${id}">
        <h2 id="product-title-${id}">${escapeHTML(product.name)}</h2>
        <p class="description">${escapeHTML(product.description)}</p>
        <p class="price">${money(product.price)} <span>cada</span></p>
        <div class="order-options">
          <div><span id="quantity-label-${id}" class="quantity-label">Quantidade</span><div class="quantity" role="group" aria-labelledby="quantity-label-${id}"><button type="button" class="quantity-minus" aria-label="Diminuir quantidade" disabled>${icon("minus")}</button><output aria-live="polite">1</output><button type="button" class="quantity-plus" aria-label="Aumentar quantidade">${icon("plus")}</button></div></div>
          <div class="total"><span>Total</span><strong aria-live="polite">${money(product.price)}</strong></div>
        </div>
        <div class="order-cta"><a class="order-button" href="#como-encomendar">Como encomendar</a></div>
        <p class="order-note">Data, entrega e pagamento combinados no atendimento.</p>
        ${instagram ? `<a class="instagram-link" href="https://www.instagram.com/${encodeURIComponent(instagram)}/" target="_blank" rel="noopener noreferrer">Instagram: @${escapeHTML(instagram)}</a>` : ""}
      </section>`.replace(/[ \t]+$/gm, "");
};
