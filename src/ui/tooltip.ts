/**
 * One floating tooltip for every element with data-tip. Hover on desktop;
 * tap (or Enter on a focused element) to pin it on touch screens.
 */
export function installTooltips(root: HTMLElement): void {
  const box = document.createElement('div');
  box.className = 'tooltip';
  box.setAttribute('role', 'tooltip');
  box.hidden = true;
  document.body.appendChild(box);
  let pinned: Element | null = null;

  const show = (el: Element) => {
    const text = el.getAttribute('data-tip');
    if (!text) return;
    box.textContent = text;
    box.hidden = false;
    const r = el.getBoundingClientRect();
    const bw = Math.min(320, window.innerWidth - 16);
    box.style.maxWidth = `${bw}px`;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - box.offsetWidth / 2, window.innerWidth - box.offsetWidth - 8));
    let top = r.bottom + 8;
    if (top + box.offsetHeight > window.innerHeight - 8) top = r.top - box.offsetHeight - 8;
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    document.querySelectorAll('.tip-active').forEach((e) => e.classList.remove('tip-active'));
    el.classList.add('tip-active');
  };
  const hide = () => {
    box.hidden = true;
    document.querySelectorAll('.tip-active').forEach((e) => e.classList.remove('tip-active'));
  };

  root.addEventListener('pointerover', (e) => {
    if ((e as PointerEvent).pointerType === 'touch') return;
    const el = (e.target as Element).closest('[data-tip]');
    if (el && !pinned) show(el);
  });
  root.addEventListener('pointerout', (e) => {
    if ((e as PointerEvent).pointerType === 'touch' || pinned) return;
    const to = (e as PointerEvent).relatedTarget as Element | null;
    if (!to || !to.closest?.('[data-tip]')) hide();
  });
  root.addEventListener('click', (e) => {
    const el = (e.target as Element).closest('[data-tip]');
    if (el && el !== pinned) { pinned = el; show(el); }
    else { pinned = null; hide(); }
  });
  window.addEventListener('scroll', () => { if (!pinned) hide(); }, { passive: true });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { pinned = null; hide(); } });
}
