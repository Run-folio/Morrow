import fs from 'node:fs';
const [group,logPath,artifactDir]=process.argv.slice(2);
// The workflow imports three mode-choice cases as well as the twelve workspace
// cases. Keep an explicit reviewed contract: a matching count alone can hide a
// missing regression or an accidentally disabled browser suite.
const transportCases=[
 'transport fixture owns canonical geography; coordinates without identity remain unverified',
 'Transport modal keeps choices as drafts until Apply and restores the recommendation after reload',
 'Builder changes the same canonical leg choice and projects its effective time after reload',
 'Transport keeps selected journey, card and map leg synchronized at desktop and mobile widths',
 'manual booking marks and optional details survive guest save, reload, edit and explicit undo',
 'routed road evidence stays a separate reference across Builder and Transport at narrow and desktop widths',
 'Transport deep link selects canonical leg, marks the review set, and follows browser history',
 'Overview Review transfers opens Transport on the affected canonical leg',
 'Transport selection keeps repeated place occurrences distinct by canonical leg ID',
 'Transport leaves the chronological list usable when the map provider is unavailable',
 'Transport hides Omio link-outs for unknown modes and missing or past leg dates',
 'Transport builds a guarded route-specific Omio flight handoff from canonical route and date',
 'Transport builds a guarded route-specific Omio train handoff for the verified Paris to Berlin route',
 'Omio click-out opens a separate tab and returning or reloading leaves canonical trip state unchanged',
 'applying a different mode keeps a traveller booking as a visible mismatch without reassigning its details',
];
const expected={core:14,discovery:6,'multi-desktop':1,'multi-mobile':1,timing:11,transport:transportCases.length}[group];
if(!expected)throw Error('Unknown partition');
const log=fs.readFileSync(logPath,'utf8').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'');
const count=(name)=>{
 const matches=[...log.matchAll(new RegExp(group==='transport'?`^(?:#|ℹ) ${name} (\\d+)\\r?$`:`(?:#|ℹ) ${name} (\\d+)`,'gm'))];
 if(!matches.length)throw Error(`Missing ${name} count for ${group}`);
 if(group==='transport'&&matches.length!==1)throw Error(`Duplicate ${name} count for transport`);
 return Number(matches[0][1]);
};
if(group==='transport'){
 const plans=[...log.matchAll(/^1\.\.(\d+)\r?$/gm)];
 const cases=[...log.matchAll(/^(ok|not ok) (\d+) - (.+?)\r?$/gm)];
 // Fail closed on nameless, truncated or nested results rather than silently
 // omitting them from the reviewed flat test set.
 const resultLines=log.split(/\r?\n/).filter(line=>/^\s*(?:not )?ok\b/.test(line));
 const names=new Set(cases.map(match=>match[3]));
 if(plans.length!==1||Number(plans[0][1])!==expected||cases.length!==expected||resultLines.length!==cases.length||names.size!==expected
   ||cases.some((match,index)=>match[1]!=='ok'||Number(match[2])!==index+1||!transportCases.includes(match[3]))
   ||/^Bail out!/m.test(log)||count('tests')!==expected||count('skipped')!==0||count('todo')!==0)
  throw Error('Incomplete or failed transport qualification: reviewed cases, TAP plan and zero skipped/todo cases are required');
}
if(count('pass')!==expected||count('fail')!==0||count('cancelled')!==0)throw Error('Incomplete or failed '+group+' qualification');
fs.mkdirSync(artifactDir,{recursive:true});
const acceptanceFiles=fs.readdirSync(artifactDir).filter(name=>/^acceptance-.*\.json$/.test(name));
const multiArea=['multi-desktop','multi-mobile'].includes(group);
const acceptancePerformance=acceptanceFiles.map(name=>{
 const report=JSON.parse(fs.readFileSync(artifactDir+'/'+name,'utf8'));
 const width=group==='multi-desktop'?1440:390;
 if(!multiArea||!['South Korea','Africa'].includes(report.area)||report.scope!=='multi-area-discovery-acceptance'
   ||name!==`acceptance-${report.area.toLowerCase().replaceAll(' ','-')}-${width}.json`
   ||report.width!==width||report.type!==(width===1440?'return_to_start':'one_way')
   ||report.thresholdMs!==2500||!Number.isFinite(report.elapsedMs)||report.elapsedMs<0||report.elapsedMs>=15000
   ||!Number.isFinite(report.driverMs)||report.driverMs<0||report.thresholdPassed!==(report.elapsedMs<2500)
   ||report.functionalTimeoutMs!==15000||report.functionalStatus!=='passed')throw Error('Invalid/incomplete acceptance-performance record');
 return report;
}).sort((a,b)=>['South Korea','Africa'].indexOf(a.area)-['South Korea','Africa'].indexOf(b.area));
if(multiArea&&(acceptancePerformance.length!==2||new Set(acceptancePerformance.map(report=>report.area)).size!==2))
 throw Error('Invalid/incomplete acceptance-performance coverage: South Korea and Africa records are required');
const performanceFailures=acceptancePerformance.filter(report=>!report.thresholdPassed);
for(const failure of performanceFailures){
 console.log(`::warning title=Discovery acceptance performance failure::${failure.area} ${failure.width}px acceptance ${failure.elapsedMs.toFixed(1)}ms >= unchanged 2500ms target. Functional and recovery assertions completed.`);
}
const result={group,expected,nonwaivedCasesPassed:count('pass'),nonwaivedFailures:0,...(group==='transport'?{verifiedCases:transportCases,skipped:0,cancelled:0,todo:0}:{}),
 ...(multiArea?{functionalStatus:'passed',performanceStatus:performanceFailures.length?'failed':'passed',performanceTargetMs:2500,acceptancePerformance,performanceFailures}:{}),
 classification:performanceFailures.length?'functional-gates-pass-with-performance-failures':'pass',commit:process.env.COMMIT_REF??null};
fs.writeFileSync(artifactDir+'/qualification.json',JSON.stringify(result,null,2));
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`### ${group}: ${expected} functional cases passed\n\n`
 +acceptancePerformance.map(f=>`- **${f.thresholdPassed?'PERFORMANCE PASS':'PERFORMANCE FAILURE'}:** ${f.area} ${f.width}px ${f.elapsedMs.toFixed(1)}ms ${f.thresholdPassed?'<':'>='} unchanged 2500ms target. Functional/recovery checks passed within existing bounds.\n`).join(''));
console.log(JSON.stringify(result));
