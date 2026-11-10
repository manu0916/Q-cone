// Uma figura pequena por adição; só transform/opacity, sem loop de layout.
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const flights = new Set();
const arrivals = new WeakMap();

function coneIcon(flavor) {
  const topping = flavor === 'maracuja' ? '#f5bd00' : '#e52950';
  return `<svg viewBox="0 0 80 120" fill="none" aria-hidden="true"><path d="M17 48 40 114 63 48Z" fill="#d9974f" stroke="#975c2c" stroke-width="2"/><path d="m23 60 29 20M27 75l20 14M32 89l11 8M57 60 29 80M52 76 34 90M47 91l-9 7" stroke="#f5cd88" stroke-width="2"/><path d="M16 48c-8-9-2-20 4-23C19 12 30 5 40 9c12-5 23 5 22 16 9 5 12 16 3 24-4 5-9-1-12 1-5 3-6 16-12 12-5-3-1-13-8-13-5 0-9 9-13 6Z" fill="#fff1cc" stroke="#d9b781" stroke-width="2"/><g fill="${topping}"><path d="m24 23 7-5 4 8-8 4zM44 17l9 3-3 9-7-4zM52 34l8-3 3 8-8 3zM30 38l7-5 5 8-8 5zM17 35l5-3 3 6-5 3z"/></g>${flavor === 'maracuja' ? '<g fill="#684021"><ellipse cx="39" cy="23" rx="1.5" ry="2"/><ellipse cx="48" cy="37" rx="1.5" ry="2"/><ellipse cx="26" cy="32" rx="1.5" ry="2"/></g>' : ''}</svg>`;
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
