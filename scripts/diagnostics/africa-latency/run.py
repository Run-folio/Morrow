from pathlib import Path
import os,subprocess,json,time,hashlib,tarfile,signal,re,urllib.request,datetime,shutil
ROOT=Path.cwd();OUT=ROOT/'africa-diagnostic-evidence';OUT.mkdir(exist_ok=True)
BASE='ef44beef72c44cccf65dcf5544805aba4db294f6'
NAME='actual multi-area Discovery 1440px return_to_start stays responsive, allocates generated nights and survives rapid edits and reload'
record={'baseCommit':BASE,'diagnosticCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'started':datetime.datetime.now(datetime.timezone.utc).isoformat(),'maximumExecutions':2,'executions':[],'verdict':'PREPARING'}
def save(): (OUT/'result.json').write_text(json.dumps(record,indent=2)+'\n')
def command(cmd,log,cwd=ROOT,env=None,timeout=360):
 with (OUT/log).open('w') as f:
  p=subprocess.run(cmd,cwd=cwd,env=env,stdout=f,stderr=subprocess.STDOUT,timeout=timeout)
 if p.returncode:raise RuntimeError('Setup command failed: '+log)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def ready(url,proc,limit=40):
 end=time.monotonic()+limit
 while time.monotonic()<end:
  if proc.poll() is not None:raise RuntimeError('server exited before readiness')
  try:
   with urllib.request.urlopen(url,timeout=2) as r:
    if r.status==200:return
  except Exception:pass
  time.sleep(.25)
 raise RuntimeError('server readiness timeout')
def stop(p):
 if p and p.poll() is None:
  os.killpg(p.pid,signal.SIGTERM)
  try:p.wait(timeout=10)
  except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait(timeout=5)
def execute(mode):
 target=ROOT/('africa-'+mode+'-copy');target.mkdir()
 archive=subprocess.check_output(['git','archive',BASE]);archivePath=OUT/(mode+'-base.tar');archivePath.write_bytes(archive)
 with tarfile.open(archivePath) as tar:
  members=tar.getmembers();omitted=[m.name for m in members if m.issym() or m.islnk()];tar.extractall(target,members=[m for m in members if not (m.issym() or m.islnk())],filter='data')
 (target/'node_modules').symlink_to(ROOT/'node_modules',target_is_directory=True)
 row={'mode':mode,'omittedArchiveLinks':omitted,'baseArchiveSha256':sha(archivePath),'lockfileSha256':sha(target/'package-lock.json'),'originalBrowserTestSha256':sha(target/'tests/core-journey-app-browser.test.ts'),'status':'SETUP'};record['executions'].append(row);save()
 command(['node',str(ROOT/'scripts/diagnostics/africa-latency/prepare.cjs'),str(target),mode],mode+'-prepare.log')
 shutil.copyfile(target/'diagnostic-source-manifest.json',OUT/(mode+'-source-manifest.json'))
 env=os.environ.copy();env['COMMIT_REF']=BASE
 command(['npm','run','build'],mode+'-build.log',target,env,timeout=360)
 manifest=json.loads((target/'public/easyt-offline-manifest.js').read_text().split('Object.freeze(',1)[1].rsplit(');',1)[0]);(OUT/(mode+'-build-manifest.json')).write_text(json.dumps(manifest,indent=2))
 row.update(buildId=manifest['buildId'],artifactId=manifest['artifactId'],embeddedCommitMeaning='base provenance; see source manifest for measured modifications');save()
 artifacts=OUT/mode;artifacts.mkdir();server=None;prof=None;sf=None;pf=None
 try:
  sf=(OUT/(mode+'-server.log')).open('w');serverCmd=['node']+(['--inspect=127.0.0.1:9229'] if mode=='measured' else [])+['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3100'];server=subprocess.Popen(serverCmd,cwd=target,env=env,stdout=sf,stderr=subprocess.STDOUT,start_new_session=True);ready('http://127.0.0.1:3100/journey/new',server)
  if mode=='measured':
   pf=(OUT/'server-profile.log').open('w');profilePath=artifacts/'server-cpu-profile.json';prof=subprocess.Popen(['node',str(ROOT/'scripts/diagnostics/africa-latency/server-profile.cjs'),str(profilePath)],stdin=subprocess.PIPE,stdout=pf,stderr=subprocess.STDOUT,start_new_session=True)
   end=time.monotonic()+10
   while not Path(str(profilePath)+'.ready').exists():
    if prof.poll() is not None or time.monotonic()>end:raise RuntimeError('server CPU profiler failed readiness')
    time.sleep(.1)
  for k in ['MORROVIA_BROWSER_CHANNEL','NODE_OPTIONS','DEBUG','DEBUG_FILE','MORROVIA_PLAYWRIGHT_MODULE']:env.pop(k,None)
  env.update(MORROVIA_CORE_JOURNEY_BROWSER_TESTS='1',MORROVIA_BASE_URL='http://127.0.0.1:3100',MORROVIA_BROWSER_ARTIFACT_DIR=str(artifacts))
  cmd=['node','--experimental-strip-types','--test','--test-name-pattern=^'+re.escape(NAME)+'$','tests/core-journey-app-browser.test.ts'];row.update(command=cmd,status='RUNNING',started=datetime.datetime.now(datetime.timezone.utc).isoformat());save()
  with (OUT/(mode+'-test.log')).open('w') as f:
   testProc=subprocess.Popen(cmd,cwd=target,env=env,stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
   try:code=testProc.wait(timeout=240)
   except subprocess.TimeoutExpired:stop(testProc);code=124
  log=(OUT/(mode+'-test.log')).read_text();m=re.search(r"Africa multi-add responds within 2\.5 seconds \(([\d.]+)ms browser, ([\d.]+)ms driver\)",log)
  oneTest=bool(re.search(r'# tests 1\b',log) or re.search(r'ℹ tests 1\b',log) or len(re.findall(r'^(?:not ok|ok) \d+ - '+re.escape(NAME)+r'$',log,re.M))==1);oneFail=bool(re.search(r'# fail 1\b',log) or re.search(r'ℹ fail 1\b',log))
  row.update(exitCode=code,finished=datetime.datetime.now(datetime.timezone.utc).isoformat(),africaReproduced=bool(m and oneTest and oneFail and code!=124),status='PASS' if code==0 and oneTest else 'FAIL')
  if m:row.update(browserMs=float(m[1]),driverMs=float(m[2]))
  save();return row
 finally:
  if prof and prof.poll() is None:
   prof.stdin.write(b'stop\n');prof.stdin.flush()
   try:prof.wait(timeout=15)
   except subprocess.TimeoutExpired:stop(prof)
  stop(server)
  if sf:sf.close()
  if pf:pf.close()
  # Preserve exactly the instrumented sources for review; no full node_modules/build archive.
  for path in ['app/journey/new/trip-builder.tsx','lib/easyt/discovery-commit.ts','lib/easyt/trip-builder-async-edit-session.ts','lib/easyt/diagnostic-latency.ts','tests/core-journey-app-browser.test.ts']:
   src=target/path
   if src.exists():dst=OUT/'sources'/mode/path;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,dst)
save()
try:
 command(['bash','-c','uname -a; cat /etc/os-release; lscpu; cat /sys/fs/cgroup/cpu.max 2>/dev/null || true; free -m; node --version; npm --version; node -e "console.log(require(\'playwright/package.json\').version);console.log(JSON.stringify(require(\'./node_modules/playwright-core/browsers.json\').browsers.filter(b=>b.name===\'chromium\')))"'],'environment.log')
 control=execute('control')
 if control['africaReproduced']:
  measured=execute('measured');record['verdict']='MEASURED_REPLAY_COMPLETE_DIAGNOSTIC_ONLY'
 elif control['status']=='PASS':record['verdict']='STOP_NOT_REPRODUCED'
 else:record['verdict']='STOP_OTHER_CONTROL_FAILURE'
except Exception as error:
 record['verdict']='STOP_SETUP_OR_COLLECTION_FAILURE';record['error']=str(error);save();raise
finally:
 record['finished']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
