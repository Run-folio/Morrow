import assert from "node:assert/strict";
import test from "node:test";
import { builderBrowserTestsEnabled, renderBuilder } from "./helpers/builder-render.ts";

for (const width of [1440,390]) test(`fresh planner exposes Home controls and preserves input before Import at ${width}px`, {skip: !builderBrowserTestsEnabled, timeout: 60000}, async () => {
  const view = await renderBuilder({styled: true, offlineOnly: true});
  try {
    const p = view.page;
    await p.setViewportSize({width, height: 900});
    const form = p.locator("#new-trip-planner");
    await form.getByRole("tab", {name:"Plan",exact:true}).waitFor();
    assert.equal(await form.getByRole("tab", {name:"Plan",exact:true}).getAttribute("aria-selected"),"true");
    await form.getByText("One way",{exact:true}).click();
    const start = form.getByRole("combobox",{name:"Start from",exact:true});
    await start.fill("Gatwick");
    await form.getByRole("tab",{name:"Describe",exact:true}).click();
    await form.getByRole("tab",{name:"Plan",exact:true}).click();
    assert.equal(await start.inputValue(),"Gatwick");
    assert.ok(await form.evaluate((el:HTMLElement)=>el.getBoundingClientRect().right<=innerWidth+1));
    const entry = p.getByRole("link",{name:"Import existing trip"});
    await entry.click();
    await p.waitForURL("**/journey/new/import");
    await p.goBack();
    await start.waitFor();
    assert.equal(await start.inputValue(),"Gatwick");
  } finally { await view.close(); }
});
