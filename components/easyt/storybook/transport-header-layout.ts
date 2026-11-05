/** Rendered paint bounds matter: a heading may overflow its grid cell without
 * increasing document scrollWidth. Used only by Storybook and synthetic QA. */
export function assertTransportHeaderFits(root: ParentNode) {
  const heading = root.querySelector<HTMLElement>('#transport-workspace-heading');
  const control = root.querySelector<HTMLElement>('button[aria-controls="transport-route-map"]');
  if (!heading || !control) throw new Error('Transport header fixture is missing its heading or map control');
  const title = heading.getBoundingClientRect(), button = control.getBoundingClientRect();
  const paintRight = Math.max(title.right, title.left + heading.scrollWidth);
  const verticalOverlap = title.bottom > button.top + 1 && button.bottom > title.top + 1;
  const horizontalOverlap = paintRight > button.left + 1 && button.right > title.left + 1;
  if (horizontalOverlap && verticalOverlap) throw new Error('Transport heading paint overlaps map control');
  if (heading.scrollWidth > heading.clientWidth + 1) throw new Error('Transport heading paint exceeds its allocated width');
  if (button.width < 43.5 || button.height < 39.5) throw new Error('Transport map control lost its existing target size');
  return { title: heading.textContent, headingWidth: heading.clientWidth, headingPaintWidth: heading.scrollWidth, controlWidth: button.width, controlHeight: button.height };
}
