import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const reportPath = path.join(root, "artifacts/published-route-image-review/report.json");
const outputPath = path.join(root, "artifacts/published-route-image-review/review.html");
const report = JSON.parse(await readFile(reportPath, "utf8"));
const reviews = Array.isArray(report.reviewRequired) ? report.reviewRequired : [];
const embedded = JSON.stringify(reviews).replaceAll("<", "\\u003c");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Morrovia published-route image review</title>
<style>
:root{color-scheme:light;font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#18145f;background:#f4f2fb}*{box-sizing:border-box}
body{margin:0}.header{position:sticky;top:0;z-index:3;padding:20px 28px;background:#fffefddd;border-bottom:1px solid #ddd9ed;backdrop-filter:blur(14px)}
h1{margin:0 0 6px;font-family:Georgia,serif;font-size:28px}.summary{margin:0;color:#625f7e}.toolbar{display:flex;gap:10px;align-items:center;margin-top:14px;flex-wrap:wrap}
button{font:inherit;font-weight:700;border:1px solid #cbc7e2;border-radius:999px;background:white;color:#211976;padding:9px 14px;cursor:pointer}button:hover,button:focus-visible{border-color:#3025dc;outline:3px solid #d9d5ff;outline-offset:2px}.primary{background:#3025dc;color:white;border-color:#3025dc}.reject{color:#a51e52}.count{margin-left:auto;font-weight:700}
main{max-width:1500px;margin:auto;padding:24px;display:grid;gap:24px}.review{background:#fff;border:1px solid #dedbea;border-radius:18px;padding:20px;box-shadow:0 12px 30px #2119760a}.review h2{margin:0;font:700 25px Georgia,serif}.reason{color:#625f7e;margin:7px 0 16px}.candidates{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.candidate{border:2px solid #e0ddec;border-radius:14px;overflow:hidden;background:#faf9ff}.candidate[data-picked=true]{border-color:#3025dc;box-shadow:0 0 0 3px #d9d5ff}.candidate img{display:block;width:100%;aspect-ratio:3/2;object-fit:cover;background:#e9e7f1}.details{padding:13px}.details p{margin:5px 0;font-size:13px;line-height:1.4}.evidence{color:#287157}.concerns{color:#9a335d}.candidate-actions{display:flex;gap:8px;margin-top:12px}.source{color:#3025dc}.decision{margin-top:14px;padding-top:14px;border-top:1px solid #e7e4ef;display:flex;align-items:center;gap:10px}.status{font-weight:700;color:#287157}
@media(max-width:800px){.header{padding:16px}.count{margin-left:0;width:100%}main{padding:14px}.candidates{grid-template-columns:1fr}.review{padding:15px}}
</style></head><body><header class="header"><h1>Published-route image review</h1><p class="summary">Review the ${reviews.length} destinations that need editorial judgement. Decisions stay in this browser until exported.</p><div class="toolbar"><button class="primary" id="download">Download editorial-decisions.json</button><button id="clear">Clear decisions</button><span class="count" id="count"></span></div></header><main id="board"></main>
<script>
const reviews=${embedded}; const storageKey='morrovia-published-route-image-decisions-v1'; let decisions=JSON.parse(localStorage.getItem(storageKey)||'{}');
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
function candidates(review){return [review.selectedCandidate,...(review.alternatives||[])].filter(Boolean).slice(0,3)}
function save(){localStorage.setItem(storageKey,JSON.stringify(decisions)); renderCount()}
function decide(destination,decision,providerAssetId){decisions[destination]={destination,decision,...(providerAssetId?{providerAssetId}:{})};save();render()}
function renderCount(){const done=Object.keys(decisions).length;document.querySelector('#count').textContent=done+' / '+reviews.length+' reviewed'}
function render(){document.querySelector('#board').innerHTML=reviews.map(review=>{const items=candidates(review);const current=decisions[review.destination];return '<section class="review"><h2>'+esc(review.destination)+'</h2><p class="reason">'+esc(review.reason)+'</p><div class="candidates">'+items.map((candidate,index)=>{const picked=current?.providerAssetId===candidate.id;return '<article class="candidate" data-picked="'+picked+'"><img src="'+esc(candidate.previewUrl)+'" alt="Candidate for '+esc(review.destination)+'"><div class="details"><p><strong>Candidate '+(index+1)+'</strong> · '+esc(candidate.provider)+' · confidence '+esc(candidate.score)+'</p><p>'+esc(candidate.author||'Photographer metadata unavailable')+' · <a class="source" href="'+esc(candidate.licenseUrl||'#')+'" target="_blank" rel="noreferrer">'+esc(candidate.license||'Licence metadata unavailable')+'</a></p><p><a class="source" href="'+esc(candidate.sourceUrl)+'" target="_blank" rel="noreferrer">Open provider source</a></p><p class="evidence"><strong>Evidence:</strong> '+esc((candidate.evidence||[]).join(' · ')||'None recorded')+'</p><p class="concerns"><strong>Why review:</strong> '+esc((candidate.concerns||[]).join(' · ')||review.reason)+'</p><div class="candidate-actions"><button data-destination="'+esc(review.destination)+'" data-id="'+esc(candidate.id)+'" data-action="'+(index?'alternative selected':'accepted')+'">'+(index?'Prefer alternative':'Accept')+'</button></div></div></article>'}).join('')+'</div><div class="decision"><button class="reject" data-destination="'+esc(review.destination)+'" data-action="rejected">Reject all</button><span class="status">'+esc(current?current.decision:'Awaiting review')+'</span></div></section>'}).join('');document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>decide(button.dataset.destination,button.dataset.action,button.dataset.id)))}
document.querySelector('#download').addEventListener('click',()=>{const ordered=reviews.flatMap(review=>decisions[review.destination]?[decisions[review.destination]]:[]);const blob=new Blob([JSON.stringify(ordered,null,2)+'\\n'],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='editorial-decisions.json';link.click();URL.revokeObjectURL(link.href)});
document.querySelector('#clear').addEventListener('click',()=>{decisions={};save();render()});render();renderCount();
</script></body></html>`;

await writeFile(outputPath, html);
console.log(`Review board: ${path.relative(root, outputPath)} (${reviews.length} destinations)`);
