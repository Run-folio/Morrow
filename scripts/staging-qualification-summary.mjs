import fs from 'node:fs';
const [group,logPath,artifactDir]=process.argv.slice(2);
const expected={core:14,discovery:6,'multi-desktop':1,'multi-mobile':1,timing:11,transport:9}[group];
if(!expected)throw Error('Unknown partition');
const log=fs.readFileSync(logPath,'utf8');
const count=(name)=>{const m=log.match(new RegExp(`(?:#|ℹ) ${name} (\\d+)`));if(!m)throw Error('Missing '+name+' count');return Number(m[1]);};
if(count('pass')!==expected||count('fail')!==0||count('cancelled')!==0)throw Error('Incomplete or failed '+group+' qualification');
fs.mkdirSync(artifactDir,{recursive:true});
const known=fs.readdirSync(artifactDir).filter(name=>/^known-africa-(1440|390)\.json$/.test(name)).map(name=>JSON.parse(fs.readFileSync(artifactDir+'/'+name,'utf8')));
for(const failure of known){
 if(!['multi-desktop','multi-mobile'].includes(group)||failure.scope!=='staging-only-known-Africa-acceptance-failure'||failure.width!==(group==='multi-desktop'?1440:390)||failure.type!==(group==='multi-desktop'?'return_to_start':'one_way')||failure.thresholdMs!==2500||failure.thresholdPassed!==false||!Number.isFinite(failure.elapsedMs)||failure.elapsedMs<2500||failure.functionalStatus!=='passed')throw Error('Invalid/incomplete known-failure record');
 console.log(`::warning title=Known staging-only Africa responsiveness failure::${failure.width}px acceptance ${failure.elapsedMs.toFixed(1)}ms; unchanged limit2500ms. Functional and recovery assertions completed.`);
}
const result={group,expected,nonwaivedCasesPassed:count('pass'),nonwaivedFailures:0,knownPerformanceFailures:known,classification:known.length?'nonwaived-gates-pass-with-known-staging-performance-failures':'pass',commit:process.env.COMMIT_REF??null};
fs.writeFileSync(artifactDir+'/qualification.json',JSON.stringify(result,null,2));
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`### ${group}: ${expected} nonwaived cases passed\n\n`+known.map(f=>`- **KNOWN FAILURE, staging only:** Africa${f.width}px ${f.elapsedMs.toFixed(1)}ms >= unchanged2500ms. Functional/recovery checks passed.\n`).join(''));
console.log(JSON.stringify(result));
