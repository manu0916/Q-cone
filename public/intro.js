"use strict";
(() => {
  const intro = document.querySelector('.brand-intro');
  if (!intro) return;
  const logo = intro.querySelector('img');
  const canvas = intro.querySelector('canvas');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  let finished = false;
  const dismiss = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(frame);
    clearTimeout(failsafe);
    document.body.classList.add('intro-skipped');
    intro.remove();
    // Liberar o bitmap, inclusive ao pular antes do fim.
    if (canvas) canvas.width = canvas.height = 0;
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('pointerdown', dismiss);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', resize);
    motion.removeEventListener('change', onMotion);
  };
  const onKeyDown = event => { if (event.key === 'Escape' || event.key === 'Tab') dismiss(); };
  const onVisibility = () => { if (document.hidden) dismiss(); };
  const onMotion = () => { if (motion.matches) dismiss(); };
  const failsafe = setTimeout(dismiss, 3600);
  let width, height, radius, dirty = true;
  const resize = () => { dirty = true; };
  if (location.hash || motion.matches || document.hidden || (logo.complete && !logo.naturalWidth)) {
    dismiss();
    return;
  }
  const ctx = canvas?.getContext('2d', { alpha: true });
  if (!ctx) { dismiss(); return; }

  // Até 1 milhão de pixels, mesmo em celulares de DPR 3/4. O bitmap nunca
  // ultrapassa a viewport; só as coordenadas dos caminhos crescem.
  const fit = () => {
    width = intro.clientWidth;
    height = intro.clientHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.25, Math.sqrt(1000000 / Math.max(1, width * height)));
    canvas.width = Math.max(1, Math.floor(width * ratio));
    canvas.height = Math.max(1, Math.floor(height * ratio));
    ctx.setTransform(canvas.width / Math.max(1, width), 0, 0, canvas.height / Math.max(1, height), 0, 0);
    radius = Math.hypot(width, height) * .65;
    dirty = false;
  };
  const points = Array.from({ length: 64 }, (_, i) => {
    const angle = i * Math.PI / 32;
    const r = 1 + .045 * Math.sin(3 * angle) + .025 * Math.cos(5 * angle);
    return [Math.cos(angle) * r, Math.sin(angle) * r];
  });
  const contour = size => {
    ctx.moveTo(points[0][0] * size, points[0][1] * size);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0] * size, points[i][1] * size);
    ctx.closePath();
  };
  const ease = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
  const colors = ['#e73568', '#f0443e', '#f8e9bd'];
  const start = performance.now();
  let lastPaint = -Infinity;
  const draw = now => {
    if (finished) return;
    const elapsed = now - start;
    if (elapsed >= 3000) { dismiss(); return; }
    frame = requestAnimationFrame(draw);
    // Telas de 120 Hz não precisam desenhar o efeito duas vezes mais rápido.
    if (now - lastPaint < 1000 / 60 - 1) return;
    lastPaint = now;
    if (dirty) fit();
    ctx.clearRect(0, 0, width, height);
    if (elapsed < 1320) {
      ctx.fillStyle = '#a51b4b';
      ctx.fillRect(0, 0, width, height);
    }
    for (let i = 0; i < colors.length; i++) {
      const outer = radius * (.035 + 1.065 * ease((elapsed - i * 100) / 1120));
      const hole = radius * 1.5 * ease((elapsed - 1320 - (2 - i) * 80) / 1380);
      if (hole >= outer) continue;
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.rotate(-.6 + elapsed / 3000 * (2.5 + i * .25));
      ctx.beginPath();
      contour(outer);
      if (hole > 0) contour(hole);
      ctx.fillStyle = colors[i];
      ctx.fill('evenodd');
      ctx.restore();
    }
  };
  fit();
  frame = requestAnimationFrame(draw);
  logo.addEventListener('error', dismiss, { once: true });
  intro.addEventListener('animationend', event => { if (event.target === intro) dismiss(); });
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('pointerdown', dismiss, { once: true, passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', resize, { passive: true });
  motion.addEventListener('change', onMotion);
})();
