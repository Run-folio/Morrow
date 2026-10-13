from pathlib import Path
import os,subprocess,json,time,hashlib,tarfile,io,signal,re,urllib.request,datetime,shutil,sys
ROOT=Path.cwd();OUT=ROOT/'mobile-boundary-evidence';OUT.mkdir(exist_ok=True)
BASE='f793b6d85e9a05cb5db3c465a790d96956373cc6';PATTERN='^actual (?:Japan|South Korea|Africa) only multi-add'
EXPECTED=[f'actual {area} only multi-add {width}px completes Discovery, Build and reload' for area in ['Japan','South Korea','Africa'] for width in [1440,390]]
record={'baseCommit':BASE,'diagnosticCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'started':datetime.datetime.now(datetime.timezone.utc).isoformat(),'maximumPartitionExecutions':1,'partitionExecutions':0,'expectedNames':EXPECTED,'verdict':'PREPARING'}
def save(): (OUT/'result.json').write_text(json.dumps(record,indent=2)+'\n')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def command(cmd,log,cwd=ROOT,env=None,timeout=360):
 with (OUT/log).open('w') as f:p=subprocess.run(cmd,cwd=cwd,env=env,stdout=f,stderr=subprocess.STDOUT,timeout=timeout)
 if p.returncode:raise RuntimeError('Setup command failed: '+log)
def stop(p):
 if p and p.poll() is None:
  os.killpg(p.pid,signal.SIGTERM)
  try:p.wait(timeout=10)
  except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait(timeout=5)
def ready(server):
 for _ in range(160):
  if server.poll() is not None:raise RuntimeError('Server exited before readiness')
  try:
   with urllib.request.urlopen('http://127.0.0.1:3100/journey/new',timeout=2) as r:
    if r.status==200:return
  except Exception:pass
  time.sleep(.25)
 raise RuntimeError('Server readiness timeout')
TARGET=ROOT/'mobile-boundary-copy';server=None;sf=None;testProc=None;code=1
save()
try:
 assert subprocess.check_output(['git','rev-parse','--verify',BASE+'^{commit}'],text=True).strip()==BASE
 archive=subprocess.check_output(['git','archive',BASE]);TARGET.mkdir();record['baseArchiveSHA256']=hashlib.sha256(archive).hexdigest()
 with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
  members=tar.getmembers();assert not any(m.issym() or m.islnk() for m in members),'Unexpected tracked link in application base'
  tar.extractall(TARGET,filter='data')
 (TARGET/'node_modules').symlink_to(ROOT/'node_modules',target_is_directory=True)
 shutil.copyfile(TARGET/'tests/core-journey-app-browser.test.ts',TARGET/'diagnostic-base-browser-test.txt')
 record['lockfileSHA256']=sha(TARGET/'package-lock.json');save()
 command(['python3',str(ROOT/'scripts/diagnostics/mobile-boundary/prepare.py'),str(TARGET)],'prepare.log')
 command(['node',str(ROOT/'scripts/diagnostics/mobile-boundary/verify.mjs'),str(TARGET),str(OUT/'observation-verification.json')],'source-verification.log')
 shutil.copyfile(TARGET/'instrumentation-manifest.json',OUT/'instrumentation-manifest.json')
 sources=['app/journey/new/trip-builder.tsx','lib/easyt/trip-builder-async-edit-session.ts','lib/easyt/two-store-trip-persistence.ts','lib/easyt/mobile-boundary-diagnostic.ts','tests/core-journey-app-browser.test.ts','lib/easyt/recovery-domain-policy.ts']
 for path in sources:
  dst=OUT/'sources'/path;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(TARGET/path,dst)
 command(['bash','-c','uname -a; cat /etc/os-release; node --version; npm --version; node -e "console.log(require(\'playwright/package.json\').version);console.log(JSON.stringify(require(\'./node_modules/playwright-core/browsers.json\').browsers.filter(b=>b.name===\'chromium\')))"'],'environment.log')
 env=os.environ.copy();env['COMMIT_REF']=BASE
 command(['npm','run','build'],'build.log',TARGET,env)
 manifest=json.loads((TARGET/'public/easyt-offline-manifest.js').read_text().split('Object.freeze(',1)[1].rsplit(');',1)[0]);assert manifest['buildCommit']==BASE
 (OUT/'build-manifest.json').write_text(json.dumps(manifest,indent=2));record.update(buildId=manifest['buildId'],artifactId=manifest['artifactId']);save()
 artifacts=OUT/'artifacts';artifacts.mkdir()
 for k in ['MORROVIA_BROWSER_CHANNEL','NODE_OPTIONS','DEBUG','DEBUG_FILE','MORROVIA_PLAYWRIGHT_MODULE']:env.pop(k,None)
 # Original staged exception source is unchanged. This six-case partition has no Africa acceptance latency assertion.
 env.update(MORROVIA_CORE_JOURNEY_BROWSER_TESTS='1',MORROVIA_BASE_URL='http://127.0.0.1:3100',MORROVIA_BROWSER_ARTIFACT_DIR=str(artifacts),MORROVIA_STAGING_AFRICA_LATENCY_EXCEPTION='1')
 sf=(OUT/'server.log').open('w');server=subprocess.Popen(['node','node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3100'],cwd=TARGET,env=env,stdout=sf,stderr=subprocess.STDOUT,start_new_session=True);ready(server)
 cmd=['node','--experimental-strip-types','--test','--test-name-pattern='+PATTERN,'tests/core-journey-app-browser.test.ts'];record.update(command=cmd,partitionExecutions=1,verdict='RUNNING');save()
 with (OUT/'test.log').open('w') as f:
  testProc=subprocess.Popen(cmd,cwd=TARGET,env=env,stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
  try:code=testProc.wait(timeout=240)
  except subprocess.TimeoutExpired:stop(testProc);code=124
 log=(OUT/'test.log').read_text();seen=re.findall(r'^(?:ok|not ok) \d+ - (actual .*multi-add.*)$',log,re.M)
 counts={k:int(m.group(1)) if (m:=re.search(r'(?:#|ℹ) '+k+r' (\d+)',log)) else None for k in ['tests','pass','fail','cancelled','skipped']}
 record.update(exitCode=code,counts=counts,executedNames=seen,exactSixCaseOrder=seen==EXPECTED,verdict='PARTITION_COMPLETE_DIAGNOSTIC_ONLY' if counts['tests']==6 and seen==EXPECTED else 'STOP_INCOMPLETE_PARTITION');save()
except Exception as error:
 record.update(verdict='STOP_SETUP_OR_COLLECTION_FAILURE',error=str(error));save();raise
finally:
 stop(testProc);stop(server)
 if sf:sf.close()
 record['finished']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
 # Archive only selected evidence, never dependencies, full build directories or duplicated base tarballs.
 if (OUT/'artifacts').exists():
  files=[{'path':str(p.relative_to(OUT)),'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted((OUT/'artifacts').rglob('*')) if p.is_file()]
  (OUT/'artifact-manifest.json').write_text(json.dumps(files,indent=2))
sys.exit(code)
