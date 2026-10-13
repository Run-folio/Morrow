from pathlib import Path
import json,hashlib,subprocess,sys
root=Path(sys.argv[1]).resolve();changes=[]
def edit(rel,fn):
 p=root/rel;s=p.read_text();out=fn(s);assert out!=s,rel;changes.append({'file':rel,'baseSHA256':hashlib.sha256(s.encode()).hexdigest(),'instrumentedSHA256':hashlib.sha256(out.encode()).hexdigest()});p.write_text(out)
def once(s,old,new):
 assert s.count(old)==1,(old[:90],s.count(old));return s.replace(old,new)
helper='''// Disposable measurement only. No storage, scheduling or production capability.
const identities = new WeakMap<object, number>();let nextIdentity=0;
function enabled(){return typeof window!=='undefined'&&(window as unknown as {__mobileBoundaryEnabled?:boolean}).__mobileBoundaryEnabled===true;}
export function boundaryIdentity(value: unknown) {if(!enabled())return null;if(!value||typeof value!=='object')return null;let id=identities.get(value);if(!id){id=++nextIdentity;identities.set(value,id);}return id;}
export function boundaryTrip(value: any) {if(!enabled())return null;return value ? {object:boundaryIdentity(value),id:value.id,ownerId:value.ownerId,stops:value.stops?.map((s:any)=>({id:s.id,place:s.canonicalPlaceId,nights:s.nights})),selections:value.brief?.structuredBrief?.placeSelections?.map((s:any)=>({mention:s.mentionId,place:s.selectedCanonicalPlaceId,stop:s.routeStopId})),completed:value.brief?.structuredBrief?.completedPlanningAreaMentionIds} : null;}
export function boundarySnapshot(editor: any) {if(!enabled())return null;if(!editor)return null;const s=editor.getSnapshot();return {editor:boundaryIdentity(editor),owner:s.browserOwnerId,inputRevision:s.inputRevision,acceptedRevision:s.acceptedRevision,recovery:s.recovery,saveState:s.saveState,canonicalSaveState:s.canonicalSaveState,error:s.error,trip:boundaryTrip(s.trip)};}
export function boundaryDiagnostic(stage: string,detail: unknown) {try {if(!enabled())return;const w=window as unknown as {__mobileBoundary?:unknown[]};const records=w.__mobileBoundary??(w.__mobileBoundary=[]);if(records.length<1024)records.push({ordinal:records.length,time:performance.now(),stage,detail});}catch{/* Observer cannot affect return/disposition. */}}
'''
(root/'lib/easyt/mobile-boundary-diagnostic.ts').write_text(helper)
imports="import { boundaryDiagnostic as bd, boundaryIdentity as bi, boundaryTrip as bt, boundarySnapshot as bs } from './mobile-boundary-diagnostic.ts';\n"
def session(s):
 s=imports+s
 s=once(s,'    return runDevice(true, async () => {','    bd("session:enqueue",{sequence:continuation?.command?.sequence,projectionOnly:continuation?.projectionOnly,inputRevision,acceptedRevision,rawInputEpoch,recovery,predecessor:metadataSource.replace,candidate:bt(frozen),canonicalBase:bt(canonicalBase)});\n    return runDevice(true, async () => {\n      bd("session:execute",{sequence:continuation?.command?.sequence,projectionOnly:continuation?.projectionOnly,inputRevision,acceptedRevision,rawInputEpoch,recovery,guardCurrent:guard.isCurrent(),draftProtected});')
 s=once(s,'      if (!reserved.isCurrent()) {','      bd("session:write-return",{sequence:continuation?.command?.sequence,projectionOnly:continuation?.projectionOnly,result:{stored:result.stored,handle:result.handle,blocked:result.blockedByExistingRecovery,reason:result.failureReason,writeAttempted:result.writeAttempted,readbackConfirmed:result.readbackConfirmed,pointerAcknowledged:result.pointerAcknowledged,recoveryDurable:result.recoveryDurable,projectionDeferred:result.projectionDeferred,outcome:result.outcome},reservedCurrent:reserved.isCurrent(),inputRevision,acceptedRevision,rawInputEpoch,recovery});\n      if (!reserved.isCurrent()) {')
 s=once(s,'      continuation?.committed?.();','      bd("session:installed",{sequence:continuation?.command?.sequence,disposition:continuation?.command?.disposition,projectionOnly:continuation?.projectionOnly,inputRevision,acceptedRevision,rawInputEpoch,recovery,trip:bt(trip)});\n      continuation?.committed?.();')
 s=once(s,'    issuedCommands.add(command); lastCommand = command;','    issuedCommands.add(command); lastCommand = command;\n    bd("session:issued",{sequence:command.sequence,commandEpoch:command.rawInputEpoch,expectedInputRevision,inputRevision,acceptedRevision,rawInputEpoch,recovery,edits:edits.map(e=>({kind:e.kind,...("selection" in e?{selection:e.selection}:{} )}))});')
 s=once(s,'      return result;\n    }, cause => { command.disposition', '      bd("session:command-result",{sequence:command.sequence,disposition:command.disposition,ok:result.ok,reason:result.ok?null:result.reason,expectedInputRevision,inputRevision,acceptedRevision,rawInputEpoch,recovery,receipt:result.ok?{sequence:result.receipt.sequence,epoch:result.receipt.rawInputEpoch,acceptedRevision:result.receipt.acceptedRevision,handle:result.receipt.handle}:null});\n      return result;\n    }, cause => { command.disposition')
 old="""    return active() && receipt.sequence === commandSequence && receipt.rawInputEpoch === rawInputEpoch
      && receipt.ownerId === ownerId && receipt.tripId === tripId && receipt.acceptedRevision === acceptedRevision
      && exact(receipt.handle, recovery) && exact(receipt.trip, trip);"""
 new=old.replace('return active()', 'const current = active()')+'''
    bd("session:receipt-current",{current,active:active(),receiptSequence:receipt.sequence,commandSequence,receiptEpoch:receipt.rawInputEpoch,rawInputEpoch,receiptOwner:receipt.ownerId,ownerId,receiptTrip:receipt.tripId,tripId,receiptAcceptedRevision:receipt.acceptedRevision,acceptedRevision,receiptHandle:receipt.handle,recovery,...(!current?{handleSame:exact(receipt.handle,recovery),tripSame:exact(receipt.trip,trip)}:{})});
    return current;'''
 return once(s,old,new)
edit('lib/easyt/trip-builder-async-edit-session.ts',session)
def builder(s):
 s=once(s,'"use client";','"use client";\n'+imports.replace("'./mobile-boundary-diagnostic.ts'","'@/lib/easyt/mobile-boundary-diagnostic.ts'"))
 # Work within dispatcher: original expressions/return values retained.
 a=s.index('  const dispatchAcceptedBuilderEdits =');b=s.index('  const dispatchAcceptedBuilderEdit =',a);t=s[a:b]
 t=once(t,'    const editor = builderEditSessionRef.current;','    const editor = builderEditSessionRef.current;\n    bd("ui:dispatch-start",{editor:bi(editor),snapshot:bs(editor),expectedInputRevision:options?.expectedInputRevision,edits:edits.map(e=>({kind:e.kind,...("selection" in e?{selection:e.selection}:{})}))});')
 t=once(t,'    if (!builderMountedRef.current || builderEditSessionRef.current !== editor','    bd("ui:dispatch-accepted-return",{ok:result.ok,reason:result.ok?null:result.reason,editor:bi(editor),currentEditor:bi(builderEditSessionRef.current),mounted:builderMountedRef.current,activeOwner:activeBrowserOwnerIdRef.current,snapshot:bs(editor)});\n    if (!builderMountedRef.current || builderEditSessionRef.current !== editor')
 t=t.replace('|| editor.getSnapshot().browserOwnerId !== activeBrowserOwnerIdRef.current) return false;', '|| editor.getSnapshot().browserOwnerId !== activeBrowserOwnerIdRef.current) {bd("ui:dispatch-false",{reason:"session-owner-mount"});return false;}')
 t=t.replace('if (!editor.isCommandReceiptCurrent(result.receipt)) return false;', 'if (!editor.isCommandReceiptCurrent(result.receipt)) {bd("ui:dispatch-false",{reason:"receipt-not-current",snapshot:bs(editor)});return false;}')
 t=t.replace('    return true;', '    bd("ui:dispatch-true",{snapshot:bs(editor)});\n    return true;');s=s[:a]+t+s[b:]
 a=s.index('  const addStop = async (');b=s.index('  const ',s.index('\n  };',a)+6);t=s[a:b]
 t=once(t,'    const expectedInputRevision = sourceSnapshot?.inputRevision;', '    const expectedInputRevision = sourceSnapshot?.inputRevision;\n    bd("ui:add-stop-start",{name,place:canonicalSuggestion?.canonicalPlaceId,mention:resolvesMentionId,expectedInputRevision,snapshot:bs(builderEditSessionRef.current)});')
 t=once(t,'    const fail = (message: string) => {','    const fail = (message: string) => {\n      bd("ui:add-stop-fail",{message,lookupCurrent:lookupIsCurrent(),callerCurrent:callerIsCurrent?.(),expectedInputRevision,snapshot:bs(builderEditSessionRef.current)});')
 t=once(t,'      return existingBase ?? addedStop;', '      bd("ui:add-stop-true",{place:addedStop.canonicalPlaceId,stop:addedStop.id,snapshot:bs(builderEditSessionRef.current)});\n      return existingBase ?? addedStop;')
 t=once(t,'    } catch {\n      fail(ui.unavailable);','    } catch (cause) {\n      bd("ui:add-stop-exception",{message:cause instanceof Error?cause.message:String(cause)});\n      fail(ui.unavailable);')
 # specific caller-after-acceptance site
 t=once(t,'      if (callerIsCurrent?.() === false) return;', '      if (callerIsCurrent?.() === false) {bd("ui:add-stop-false",{reason:"caller-after-acceptance"});return;}')
 s=s[:a]+t+s[b:]
 a=s.index('  const capturePlanningAreaView =');b=s.index('  const beginPlanningAreaAction',a);t=s[a:b]
 t=once(t,'    return () => builderMountedRef.current', '    bd("ui:view-captured",{generation,editor:bi(editor),ownerId,documentId,searchVersion});\n    return () => {const current = builderMountedRef.current')
 t=once(t,'&& builderCurrentDocumentRef.current?.id === documentId && discoverySearchVersionRef.current === searchVersion;', '&& builderCurrentDocumentRef.current?.id === documentId && discoverySearchVersionRef.current === searchVersion;\n      if(!current)bd("ui:view-stale",{generation,currentGeneration:planningAreaViewRef.current.generation,editor:bi(editor),currentEditor:bi(builderEditSessionRef.current),ownerId,currentOwner:activeBrowserOwnerIdRef.current,documentId,currentDocument:builderCurrentDocumentRef.current?.id,searchVersion,currentSearchVersion:discoverySearchVersionRef.current,mounted:builderMountedRef.current});return current;};')
 s=s[:a]+t+s[b:]
 s=once(s,'      return { stored: !refused, recoveryDurable: !refused,','      bd("ui:persist-editor-return",{refused,sourceCurrent:sourceIsCurrent(),mounted:builderMountedRef.current,ownerMatches:snapshot.browserOwnerId===activeBrowserOwnerIdRef.current,documentSame:sameRecoveryDocument(snapshot.trip,trip),snapshot:bs(editor),requestedTrip:bt(trip)});\n      return { stored: !refused, recoveryDurable: !refused,')
 a=s.index('        onConfirm={async () => {');b=s.index('\n        }}',a);t=s[a:b]
 t=once(t,'          const checkpoint = async () => {','          bd("ui:confirm-start",{mention:mention.mentionId,userInputVersion,snapshot:bs(builderEditSessionRef.current),viewGeneration:planningAreaViewRef.current.generation});\n          const checkpoint = async () => {\n            bd("ui:checkpoint-start",{confirmCurrent:confirmIsCurrent(),snapshot:bs(builderEditSessionRef.current),ownerTrip:bt(discoveryOwnersRef.current.trip)});')
 # every checkpoint pre-persist rejection records state at return without altering predicate
 ca=t.index('          const checkpoint =');cb=t.index('            try {',ca);ct=t[ca:cb]
 ct=ct.replace('return false;', '{bd("ui:checkpoint-false",{confirmCurrent:confirmIsCurrent(),mounted:builderMountedRef.current,currentEditor:bi(builderEditSessionRef.current),snapshot:bs(builderEditSessionRef.current),ownerTrip:bt(discoveryOwnersRef.current.trip)});return false;}')
 ct=once(ct,'            return recovery.stored;', '            bd("ui:checkpoint-return",{stored:recovery.stored,reason:recovery.failureReason,handle:recovery.handle,blocked:recovery.blockedByExistingRecovery,snapshot:bs(editor)});\n            return recovery.stored;')
 t=t[:ca]+ct+t[cb:]
 aa=t.index('                addBase: async choice => {');ab=t.index('                linkVisit:',aa);at=t[aa:ab]
 at=once(at,'                addBase: async choice => {','                addBase: async choice => {\n                  bd("ui:add-base-start",{choice:choice.id,confirmCurrent:confirmIsCurrent(),snapshot:bs(builderEditSessionRef.current),ownerTrip:bt(discoveryOwnersRef.current.trip),viewGeneration:planningAreaViewRef.current.generation,userInputVersion,currentUserInputVersion:planningBaseSearchUserIntentVersionRef.current});')
 at=once(at,'                  if (!added || !confirmIsCurrent()) return false;', '                  bd("ui:add-base-handler-return",{choice:choice.id,added:added?{id:added.id,place:added.canonicalPlaceId}:null,confirmCurrent:confirmIsCurrent(),snapshot:bs(builderEditSessionRef.current),ownerTrip:bt(discoveryOwnersRef.current.trip)});\n                  if (!added || !confirmIsCurrent()) {bd("ui:add-base-false",{choice:choice.id,reason:!added?"add-handler-no-stop":"confirmation-stale"});return false;}')
 at=once(at,'                  return ownerHasChoice();','                  bd("ui:add-base-render-return",{choice:choice.id,ownerHasChoice:ownerHasChoice(),confirmCurrent:confirmIsCurrent(),ownerTrip:bt(discoveryOwnersRef.current.trip),snapshot:bs(builderEditSessionRef.current)});\n                  return ownerHasChoice();')
 t=t[:aa]+at+t[ab:]
 t=once(t,'              if (!result.ok) {','              bd("ui:commit-result",{...result,confirmCurrent:confirmIsCurrent(),snapshot:bs(builderEditSessionRef.current),ownerTrip:bt(discoveryOwnersRef.current.trip)});\n              if (!result.ok) {')
 return s[:a]+t+s[b:]
edit('app/journey/new/trip-builder.tsx',builder)
# Record exact two-store refusal source without logging documents or private storage.
def stores(s):
 s=imports+s
 s=once(s,'      const writeId = options.writeId ?? globalThis.crypto.randomUUID(), tripId = inputTrip.id;', '      const writeId = options.writeId ?? globalThis.crypto.randomUUID(), tripId = inputTrip.id;\n      bd("store:save-start",{ownerId,tripId,writeId,replace:options.replace,projectionOnly:options.projectionOnly,trip:bt(inputTrip),expectedSource:bt(options.expectedRecoverySource)});')
 s=once(s,'      const state = await inspect(tripId); if (state.kind !== \'resolved\') return reject(state.kind === \'protected\');','      const state = await inspect(tripId);\n      bd("store:inspect-return",{writeId,kind:state.kind,reason:"reason" in state?state.reason:null});\n      if (state.kind !== \'resolved\') return reject(state.kind === \'protected\');')
 s=once(s,"          return reject(true);\n        }\n      }\n      const requiredEntries", "          bd(\"store:predecessor-refusal\",{writeId,replace:options.replace,decodedKind:decoded?.kind,actualWriteId:decoded?.kind==='readable'?decoded.value.writeId:null,sourceSame:decoded?.kind==='readable'?JSON.stringify(prepareTripDocumentForWrite(decoded.value.trip))===JSON.stringify(prepareTripDocumentForWrite(expectedRecoverySource)):false,actual:decoded?.kind==='readable'?bt(decoded.value.trip):null,expected:bt(expectedRecoverySource)});\n          return reject(true);\n        }\n      }\n      const requiredEntries")
 return s
edit('lib/easyt/two-store-trip-persistence.ts',stores)
def tests(s):
 s=once(s,"  const page = await context.newPage();","  const page = await context.newPage();\n  await context.addInitScript(enabled => { (window as unknown as {__mobileBoundaryEnabled:boolean}).__mobileBoundaryEnabled=enabled; }, name==='single-area-South-Korea-390');")
 s=once(s,'    await context.tracing.stop();',"    await context.tracing.stop(name==='single-area-South-Korea-390'?{ path: `${artifacts}/${name}-success.zip` }:undefined);")
 s=once(s,'  } finally {\n    await context.close();',"  } finally {\n    if(name==='single-area-South-Korea-390'){mkdirSync(artifacts,{recursive:true});\n    const diagnostic=await page.evaluate(()=>(window as unknown as {__mobileBoundary?:unknown[]}).__mobileBoundary??[]).catch(()=>[]);\n    writeFileSync(`${artifacts}/${name}-boundary-final.json`,JSON.stringify(diagnostic,null,2));}\n    await context.close();")
 target="await dialog.getByRole('button',{name:`Add ${names.length} places`,exact:true}).click();await dialog.waitFor({state:'hidden'});"
 s=once(s,target,target+'''\n if(area==='South Korea'&&width===390){mkdirSync(artifacts,{recursive:true});writeFileSync(`${artifacts}/single-area-${area.replaceAll(' ','-')}-${width}-boundary-accepted.json`,JSON.stringify(await page.evaluate(()=>(window as unknown as {__mobileBoundary?:unknown[]}).__mobileBoundary??[]),null,2));}''')
 return s
edit('tests/core-journey-app-browser.test.ts',tests)
(root/'instrumentation-manifest.json').write_text(json.dumps({'base':'f793b6d85e9a05cb5db3c465a790d96956373cc6','measurementOnly':True,'changedFiles':changes,'helper':'lib/easyt/mobile-boundary-diagnostic.ts','partitionExecutionsAuthorized':1,'scope':'Original Discovery six-case partition; observer enabled only for South Korea 390px'},indent=2))
