/** Presentation geometry only; never changes the map camera or leg selection. */
export function mapLegPreviewPosition(container: { width: number; height: number }, marker: { x: number; y: number }, card: { width: number; height: number }) {
  const inset = 12;
  const width = Math.max(0, Math.min(card.width, container.width - inset * 2));
  const height = Math.max(0, Math.min(card.height, container.height - inset * 2));
  const above = marker.y - 34 - height;
  return {
    left: Math.max(inset, Math.min(marker.x - width / 2, container.width - width - inset)),
    top: Math.max(inset, Math.min(above >= inset ? above : marker.y + 34, container.height - height - inset)),
  };
}

let previewSequence = 0;
export function createMorroviaLegPreview(container: HTMLElement) {
  let activeMarker: HTMLElement | null = null;
  let card: HTMLElement | null = null;
  let pinned = false;
  const hide = () => {
    activeMarker?.removeAttribute('aria-describedby');
    activeMarker = null;
    card?.remove();
    card = null;
    pinned = false;
  };
  const position = () => {
    if (!activeMarker || !card) return;
    const bounds = container.getBoundingClientRect();
    const marker = activeMarker.getBoundingClientRect();
    const point = mapLegPreviewPosition(bounds, { x: marker.left - bounds.left + marker.width / 2, y: marker.top - bounds.top + marker.height / 2 }, card.getBoundingClientRect());
    card.style.left = `${point.left}px`;
    card.style.top = `${point.top}px`;
  };
  const show = (marker: HTMLElement, persist = false) => {
    if (activeMarker === marker && card) { pinned ||= persist; position(); return; }
    hide();
    const template = marker.querySelector<HTMLElement>('.planner-map__leg-card');
    if (!template) return;
    card = template.cloneNode(true) as HTMLElement;
    card.id = `map-leg-preview-${++previewSequence}`;
    card.removeAttribute('aria-hidden');
    card.setAttribute('role', 'tooltip');
    card.classList.add('is-visible');
    activeMarker = marker;
    pinned = persist;
    marker.setAttribute('aria-describedby', card.id);
    container.append(card);
    position();
  };
  const leave = (marker: HTMLElement) => {
    if (activeMarker === marker && !pinned && document.activeElement !== marker) hide();
  };
  const dismissOnPointer = (event: PointerEvent) => {
    if (activeMarker && !activeMarker.contains(event.target as Node)) hide();
  };
  const dismissOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') hide(); };
  container.addEventListener('pointerdown', dismissOnPointer);
  container.addEventListener('keydown', dismissOnEscape);
  return {
    show, hide, position,
    bind(marker: HTMLElement) {
      marker.addEventListener('mouseenter', () => {
        if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) show(marker);
      });
      marker.addEventListener('mouseleave', () => leave(marker));
      marker.addEventListener('focus', () => show(marker));
      marker.addEventListener('blur', () => { if (activeMarker === marker) hide(); });
    },
    destroy() {
      hide();
      container.removeEventListener('pointerdown', dismissOnPointer);
      container.removeEventListener('keydown', dismissOnEscape);
    },
  };
}
