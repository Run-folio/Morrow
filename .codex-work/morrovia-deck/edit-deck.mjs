import fs from "node:fs/promises";
import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const input = "/Users/shaun/Documents/Morrovia/.codex-work/morrovia-deck/template-starter.pptx";
const output = "/Users/shaun/Documents/Morrovia/Morrovia_Revenue_Funding_Metrics_Pitch_Deck_Refined.pptx";
const qaDir = "/Users/shaun/Documents/Morrovia/.codex-work/morrovia-deck/final";

async function writeBlob(path, blob) {
  await fs.writeFile(path, new Uint8Array(await blob.arrayBuffer()));
}

const presentation = await PresentationFile.importPptx(await FileBlob.load(input));

for (const slideNumber of [3, 5, 8, 10, 11]) {
  const slide = presentation.slides.getItem(slideNumber - 1);
  const title = slide.shapes.items.find((shape) => shape.name === "Text 0");
  if (!title) throw new Error(`Missing title on slide ${slideNumber}`);
  title.position = { left: 62.4, top: 55.68, width: 1080, height: 69.12 };
  if (slideNumber === 8) title.text.style = { fontSize: 48 };
}

const mechanism = presentation.slides.getItem(2);
const mechanismCallout = mechanism.shapes.items.find((shape) => shape.name === "Text 17");
if (!mechanismCallout) throw new Error("Missing product-mechanism callout");
mechanismCallout.text = "Contextual recommendations work because users already need to book the next step.";

const team = presentation.slides.getItem(9);
const teamSubtitle = team.shapes.items.find((shape) => shape.name === "Text 1");
const teamCallout = team.shapes.items.find((shape) => shape.name === "Text 21");
if (!teamSubtitle || !teamCallout) throw new Error("Missing team slide text frames");
teamSubtitle.position = { left: 65.28, top: 136.32, width: 980, height: 52.8 };
teamCallout.text = "Team philosophy: minimise unnecessary dilution—not the team.";

const closing = presentation.slides.getItem(12);
const closingHeadline = closing.shapes.items.find((shape) => shape.name === "Text 1");
const closingBody = closing.shapes.items.find((shape) => shape.name === "Text 2");
if (!closingHeadline || !closingBody) throw new Error("Missing closing slide text frames");
closingHeadline.position = { left: 74.88, top: 139.2, width: 662.4, height: 72 };
closingBody.position = { left: 76.8, top: 240, width: 595.2, height: 76.8 };

await fs.mkdir(qaDir, { recursive: true });
for (const [index, slide] of presentation.slides.items.entries()) {
  const stem = `slide-${String(index + 1).padStart(2, "0")}`;
  await writeBlob(`${qaDir}/${stem}.png`, await presentation.export({ slide, format: "png", scale: 2 }));
  await fs.writeFile(`${qaDir}/${stem}.layout.json`, await (await slide.export({ format: "layout" })).text());
}
await writeBlob(`${qaDir}/montage.webp`, await presentation.export({ format: "webp", montage: true, scale: 1 }));
const pptx = await PresentationFile.exportPptx(presentation);
await pptx.save(output);
console.log(output);
