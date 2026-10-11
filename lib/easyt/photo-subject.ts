/** Wider destination scenes can include parks or benches without centring them. */
export function isRepresentativeDestinationScene(value: string) {
  const text = value.normalize('NFKC').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]+/gu, ' ');
  const event = /\b(portrait|portraits|selfie|selfies|protest|protests|protesters?|rally|rallies|demonstration|demonstrations|marching|concert|concerts|parade|parades|wedding|weddings|funeral|funerals)\b/.exec(text);
  const scene = /\b(skyline|panorama|landscape|coast|beach|waterfront|street|streets|architecture|palace|temple|cathedral|mosque|bridge|monument|landmark)\b/.exec(text);
  if (event && !(scene && scene.index < event.index
    && /\b(with|including|background|distant)\b/.test(text.slice(scene.index, event.index)))) return false;
  const wider = /\b(skyline|panorama|landscape|coast|beach|waterfront|harbou?r|river|bay|mountain|cliffs|architecture|palace|temple|cathedral|mosque|bridge|monument|landmark)\b/.exec(text);
  const bench = /\b(bench|benches)\b/.exec(text);
  if (bench && !(wider && wider.index < bench.index && /\b(with|including|background|distant)\b/.test(text.slice(wider.index, bench.index)))) return false;
  return !/\b(park|parks|garden|gardens)\b/.test(text) || Boolean(wider);
}
