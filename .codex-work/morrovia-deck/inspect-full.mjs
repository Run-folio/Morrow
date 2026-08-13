import { FileBlob, PresentationFile } from "@oai/artifact-tool";
const p = await PresentationFile.importPptx(await FileBlob.load("/Users/shaun/Downloads/Morrovia_Revenue_Funding_Metrics_Pitch_Deck.pptx"));
const out = await p.inspect({kind:"slide,textbox", include:"id,slide,text,bbox,name,title", maxChars:100000});
console.log(out.ndjson);
