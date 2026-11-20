import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('signed-out claim and privacy contact are motion links with unchanged destinations',()=>{
 assert.match(source('app/journey/gift/[token]/page.tsx'),/<MotionLink className=\{styles.primaryLink\} href=\{`\/journey\/login\?next=/);
 assert.match(source('app/journey/privacy/privacy-notice.tsx'),/<MotionLink className=\{styles.primaryAction\} href="\/journey\/contact\?topic=privacy"/);
});
test('Explore retains its result gate through refinements and targets accepted result cards only',()=>{
 const s=source('components/easyt/trip-explore-workspace.tsx');
 assert.match(s,/id="explore-results" hidden=\{!visibleResults.length\}>\s*<EntryReveal ready=\{resultsPresentation === "results"\} selector="\[data-explore-card\]" \/>/);
});
test('Overview reveals actual canonical stop tiles, not loading or error messages',()=>{
 assert.match(source('components/easyt/trip-overview-workspace.tsx'),/<EntryReveal ready=\{staySteps.length > 0\} selector="\[data-overview-route-stop\]" \/>/);
});
