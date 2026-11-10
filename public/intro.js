"use strict";
(() => {
  const intro = document.querySelector('.brand-intro');
  if (!intro) return;
  const logo = intro.querySelector('img');
  const dismiss = () => {
    document.body.classList.add('intro-skipped');
    intro.remove();
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('pointerdown', dismiss);
    clearTimeout(failsafe);
  };
  const onKeyDown = event => { if (event.key === 'Escape' || event.key === 'Tab') dismiss(); };
  // Limite independente da animação e sem bloquear rolagem, foco ou cliques.
  const failsafe = setTimeout(dismiss, 4400);
  if (location.hash || window.matchMedia('(prefers-reduced-motion: reduce)').matches || (logo.complete && !logo.naturalWidth)) {
    dismiss();
    return;
  }
  logo.addEventListener('error', dismiss, { once: true });
  // A última onda termina depois das primeiras camadas; preservar o giro completo.
  const lastWave = intro.querySelector('.intro-wave--cream');
  (lastWave || intro).addEventListener('animationend', event => {
    if (event.target === (lastWave || intro)) dismiss();
  });
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('pointerdown', dismiss, { once: true });
})();
