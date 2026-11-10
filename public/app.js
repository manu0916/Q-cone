"use strict";

(() => {
  const config = window.QCONE_CONFIG;
  const catalog = document.getElementById("catalog");
  if (!config || !Array.isArray(config.products)) {
    if (!catalog.children.length) catalog.innerHTML = '<p class="catalog-error">Não foi possível carregar o catálogo. Atualize a página para tentar novamente.</p>';
    return;
  }

  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const money = value => currency.format(value);
  const phone = String(config.whatsapp || "").replace(/\D/g, "");
  const instagram = String(config.instagram || "").trim().replace(/^@/, "");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const dialog = document.getElementById("order-dialog");
  const messageField = document.getElementById("order-message");
  const copyButton = document.getElementById("copy-order");
  const copyStatus = document.getElementById("copy-status");
  let lastOrderButton = null;

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

  function message(product, quantity) {
    return `Olá, Q’Cone! Quero encomendar:\n\n${quantity} ${quantity === 1 ? "cone" : "cones"} de ${product.orderName}\nValor unitário: ${money(product.price)}\nTotal dos produtos: ${money(quantity * product.price)}\n\nPodemos combinar a data, o pagamento e a entrega ou retirada?`;
  }

  function closeOrder() { dialog.close(); }
  dialog.querySelector(".close-button").addEventListener("click", closeOrder);
  dialog.addEventListener("click", event => { if (event.target === dialog) closeOrder(); });
  dialog.addEventListener("close", () => {
    document.body.style.overflow = "";
    if (lastOrderButton && lastOrderButton.isConnected) lastOrderButton.focus({ preventScroll: true });
  });

  function openOrder(product, quantity, trigger) {
    lastOrderButton = trigger;
    dialog.dataset.flavor = product.id;
    const image = document.getElementById("order-image");
    image.src = product.photos[0].src;
    image.alt = `Cone de ${product.orderName}`;
    document.getElementById("order-product").textContent = product.name;
    document.getElementById("order-quantity").textContent = `${quantity} ${quantity === 1 ? "unidade" : "unidades"}`;
    document.getElementById("order-total").textContent = money(quantity * product.price);
    messageField.value = message(product, quantity);
    copyButton.innerHTML = `${icon("copy", 16)}Copiar pedido`;
    copyStatus.textContent = "A encomenda fica confirmada depois da resposta da Q’Cone.";
    const profileLink = document.getElementById("order-instagram");
    profileLink.hidden = !instagram;
    if (instagram) profileLink.href = `https://www.instagram.com/${encodeURIComponent(instagram)}/`;
    document.body.style.overflow = "hidden";
    dialog.showModal();
  }

  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(messageField.value);
      copyButton.innerHTML = `${icon("check")}Pedido copiado`;
      copyStatus.textContent = "Agora é só colar no direct e enviar. A confirmação é feita pelo atendimento.";
    } catch {
      messageField.focus();
      messageField.select();
      copyStatus.textContent = "Selecione a mensagem acima e copie para enviar.";
    }
  });

  config.products.forEach((product, productIndex) => {
    const photos = product.photos;
    const id = String(product.id).replace(/[^a-z0-9-]/gi, "").toLowerCase();
    let activePhoto = 0;
    let quantity = 1;
    const existingArticle = document.getElementById(id);
    const article = existingArticle || document.createElement("article");
    article.className = "product";
    article.id = id;
    article.dataset.flavor = id;
    article.setAttribute("aria-labelledby", `product-title-${id}`);
    if (!existingArticle) {
      article.innerHTML = window.QCONE_RENDER_PRODUCT(config, product, productIndex);
      catalog.append(article);
    }

    const track = article.querySelector(".photo-track");
    const previous = article.querySelector(".gallery-arrow.previous");
    const next = article.querySelector(".gallery-arrow.next");
    const dots = Array.from(article.querySelectorAll(".gallery-dots button"));
    const counter = article.querySelector(".photo-count");
    function showPhoto(index) {
      const destination = Math.max(0, Math.min(photos.length - 1, index));
      track.scrollTo({ left: destination * track.clientWidth, behavior: reducedMotion.matches ? "instant" : "smooth" });
    }
    function updateGallery() {
      activePhoto = Math.max(0, Math.min(photos.length - 1, Math.round(track.scrollLeft / (track.clientWidth || 1))));
      previous.disabled = activePhoto === 0;
      next.disabled = activePhoto === photos.length - 1;
      counter.textContent = `${activePhoto + 1} / ${photos.length}`;
      dots.forEach((dot, index) => { if (index === activePhoto) dot.setAttribute("aria-current", "true"); else dot.removeAttribute("aria-current"); });
    }
    track.addEventListener("scroll", updateGallery, { passive: true });
    track.addEventListener("keydown", event => {
      const indexes = { ArrowLeft: activePhoto - 1, ArrowRight: activePhoto + 1, Home: 0, End: photos.length - 1 };
      if (Object.prototype.hasOwnProperty.call(indexes, event.key)) { event.preventDefault(); showPhoto(indexes[event.key]); }
    });
    previous.addEventListener("click", () => showPhoto(activePhoto - 1));
    next.addEventListener("click", () => showPhoto(activePhoto + 1));
    dots.forEach((dot, index) => dot.addEventListener("click", () => showPhoto(index)));

    const minus = article.querySelector(".quantity-minus");
    const plus = article.querySelector(".quantity-plus");
    const output = article.querySelector(".quantity output");
    const total = article.querySelector(".total strong");
    const order = document.createElement(phone ? "a" : "button");
    order.className = "order-button";
    order.textContent = phone ? "Encomendar pelo WhatsApp" : "Encomendar";
    if (phone) { order.target = "_blank"; order.rel = "noopener noreferrer"; }
    else { order.type = "button"; order.addEventListener("click", () => openOrder(product, quantity, order)); }
    article.querySelector(".order-cta").replaceChildren(order);
    function updateQuantity(value) {
      quantity = Math.max(1, Math.min(99, value));
      output.textContent = String(quantity);
      total.textContent = money(quantity * product.price);
      minus.disabled = quantity === 1;
      plus.disabled = quantity === 99;
      if (phone) order.href = `https://wa.me/${phone}?text=${encodeURIComponent(message(product, quantity))}`;
    }
    minus.addEventListener("click", () => updateQuantity(quantity - 1));
    plus.addEventListener("click", () => updateQuantity(quantity + 1));
    updateQuantity(1);

    let previousWidth = track.clientWidth;
    if ("ResizeObserver" in window) {
    const resize = new ResizeObserver(() => {
      if (track.clientWidth !== previousWidth) {
        previousWidth = track.clientWidth;
        track.scrollTo({ left: activePhoto * previousWidth, behavior: "instant" });
      }
    });
    resize.observe(track);
    }
  });
})();
