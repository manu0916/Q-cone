export function setupCustomerCenter(drawer, trigger) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let slide, closing;

  trigger.onclick = () => {
    if (drawer.open) return;
    drawer.showModal();
    trigger.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('customer-center-open');
    if (!reducedMotion.matches && drawer.animate) {
      slide = drawer.animate(
        [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }],
        { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' }
      );
    }
  };

  function close() {
    if (closing) return closing;
    if (!drawer.open) return Promise.resolve();
    const currentTransform = getComputedStyle(drawer).transform;
    slide?.cancel();
    drawer.dataset.closing = 'true';
    if (!reducedMotion.matches && drawer.animate) {
      slide = drawer.animate(
        [{ transform: currentTransform }, { transform: 'translateX(100%)' }],
        { duration: 280, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }
      );
    } else {
      slide = null;
    }
    closing = (slide ? slide.finished.catch(() => {}) : Promise.resolve()).then(() => {
      drawer.close();
      slide?.cancel();
      slide = null;
      delete drawer.dataset.closing;
      trigger.setAttribute('aria-expanded', 'false');
      document.documentElement.classList.remove('customer-center-open');
      closing = null;
    });
    return closing;
  }

  drawer.querySelector('[data-close]').onclick = close;
  drawer.addEventListener('cancel', event => { event.preventDefault(); close(); });
  drawer.addEventListener('click', event => {
    if (event.target !== drawer) return;
    const bounds = drawer.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) close();
  });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) slide?.cancel();
  });
  return { close };
}
