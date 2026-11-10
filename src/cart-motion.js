// Uma figura pequena por adição; só transform/opacity, sem loop de layout.
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const flights = new Set();
const arrivals = new WeakMap();
// Preparar as duas figuras pequenas antes do primeiro clique, sem baixar fotos.
if (!motion.matches) {
  for (const flavor of ['morango', 'maracuja']) {
    const image = new Image();
    image.src = `./assets/images/cone-flight-${flavor}.svg`;
    image.decode().catch(() => {});
  }
}

function coneIcon(flavor) {
  const variant = flavor === 'maracuja' ? 'maracuja' : 'morango';
  return `<img src="./assets/images/cone-flight-${variant}.svg" alt="" width="72" height="108" decoding="async" draggable="false">`;
}

export function cancelCartFlights() {
  for (const flight of flights) cancelFlight(flight);
}

function cancelFlight(flight) {
  flight.cancel();
  flight.effect?.target?.remove();
  flights.delete(flight);
}

export function flyToCart(article, cartButton, flavor) {
  if (motion.matches || document.hidden || !Element.prototype.animate) return;
  // Cliques rápidos continuam adicionando normalmente, sem acumular figuras.
  if (flights.size >= 2) cancelFlight(flights.values().next().value);
  const source = article.querySelector('.order-cta').getBoundingClientRect();
  const target = cartButton.getBoundingClientRect();
  const sx = source.left + source.width / 2 - 36;
  const sy = Math.max(target.bottom + 12, Math.min(innerHeight - 120, source.top - 70));
  const tx = target.left + target.width / 2 - 36;
  const ty = target.top + target.height / 2 - 54;
  const cx = Math.max(8, Math.min(innerWidth - 80, (sx + tx) / 2 + (sx < tx ? -100 : 100)));
  const cy = Math.max(0, Math.min(sy, ty) - 110);
  const cone = document.createElement('div');
  cone.className = 'flying-cone';
  cone.dataset.flavor = flavor;
  cone.setAttribute('aria-hidden', 'true');
  cone.innerHTML = coneIcon(flavor);
  document.body.append(cone);
  const frames = Array.from({ length: 33 }, (_, i) => {
    const t = i / 32;
    const x = (1-t)**2*sx + 2*(1-t)*t*cx + t*t*tx;
    const y = (1-t)**2*sy + 2*(1-t)*t*cy + t*t*ty;
    const scale = t < .7 ? 1 + Math.sin(t / .7 * Math.PI) * .16 : 1 - (t - .7) / .3 * .78;
    return { offset: t, transform: `translate3d(${x}px,${y}px,0) rotate(${-25+385*t}deg) scale(${scale})`, opacity: t > .94 ? (1-t)/.06 : 1 };
  });
  const flight = cone.animate(frames, { duration: 2400, easing: 'cubic-bezier(.25,.1,.35,1)', fill: 'forwards' });
  flights.add(flight);
  const cleanup = () => { flights.delete(flight); cone.remove(); };
  flight.finished.then(() => {
    cleanup();
    if (motion.matches || document.hidden) return;
    arrivals.get(cartButton)?.cancel();
    const arrival = cartButton.animate([
      { transform: 'scale(1) rotate(0deg)' },
      { transform: 'scale(1.16) rotate(-9deg)', offset: .35 },
      { transform: 'scale(.96) rotate(6deg)', offset: .7 },
      { transform: 'scale(1) rotate(0deg)' }
    ], { duration: 480, easing: 'ease-out' });
    arrivals.set(cartButton, arrival);
  }, cleanup);
}

document.addEventListener('visibilitychange', () => { if (document.hidden) cancelCartFlights(); });
window.addEventListener('resize', cancelCartFlights, { passive: true });
motion.addEventListener('change', () => { if (motion.matches) cancelCartFlights(); });
