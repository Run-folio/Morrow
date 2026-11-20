import type { Locator, Page } from "playwright";

/** Make the selected connection's edit controls visible without toggling an already-open disclosure. */
export async function openTransportMoreActions(scope: Page | Locator) {
  const disclosure = scope.locator("[data-transport-more-actions]").first();
  const summary = disclosure.locator("summary");
  await summary.waitFor({ state: "visible" });
  if (await disclosure.getAttribute("open") === null) await summary.press("Enter");
}
