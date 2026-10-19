import 'server-only';
import {randomUUID} from 'node:crypto';

export type ActivityDiagnosticStage = 'admission' | 'provider' | 'permit-release' | 'request-boundary';
export type ActivityDiagnosticOperation = 'destination-taxonomy' | 'product-search';
export type ActivityDiagnosticOutcome = 'started' | 'completed' | 'failed' | 'denied' | 'timeout' | 'late-failed';
export type ActivityDiagnosticEvent = {stage:ActivityDiagnosticStage;operation:ActivityDiagnosticOperation;outcome:ActivityDiagnosticOutcome;elapsedMs:number;error?:unknown;httpStatus?:number};
export type ActivityDiagnosticSink = (event:ActivityDiagnosticEvent)=>void;
const stages=new Set(['admission','provider','permit-release','request-boundary']);
const operations=new Set(['destination-taxonomy','product-search']);
const outcomes=new Set(['started','completed','failed','denied','timeout','late-failed']);
const errorNames=new Set(['Error','TypeError','SyntaxError','TimeoutError','AbortError','NeonDbError','DOMException']);
const errorCodes=new Set(['42P01','42883','42501','53300','08000','08001','08003','08006','08P01','57014','57P01','57P02','57P03','40001','40P01','XX000','23505','22023','ECONNRESET','ETIMEDOUT','ENOTFOUND','ECONNREFUSED','EAI_AGAIN','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT']);
const categories=new Set(['configuration','identity','authentication','rate_limited','timeout','unavailable','malformed']);
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object';
const allowed=(value:unknown,list:Set<string>)=>typeof value==='string'&&list.has(value)?value:undefined;

/** No request, destination, permit or exception text crosses this boundary. */
export function createActivitySearchDiagnostics(emit:(line:string)=>void=line=>console.info(line)) {
 const correlationId=randomUUID();
 const sink:ActivityDiagnosticSink=(event)=>{
  try {
   const error=record(event.error)?event.error:{},cause=record(error.cause)?error.cause:{};
   const errorName=allowed(error.name,errorNames),errorCode=allowed(error.code,errorCodes);
   const causeName=allowed(cause.name,errorNames),causeCode=allowed(cause.code,errorCodes),failureCategory=allowed(error.category,categories);
   emit(JSON.stringify({event:'activity_search_diagnostic',correlationId,
    stage:allowed(event.stage,stages)??'unknown',operation:allowed(event.operation,operations)??'unknown',outcome:allowed(event.outcome,outcomes)??'unknown',
    elapsedMs:Number.isFinite(event.elapsedMs)?Math.max(0,Math.min(2_147_483_647,Math.round(event.elapsedMs))):0,
    ...(errorName?{errorName}:{}),...(errorCode?{errorCode}:{}),...(causeName?{causeName}:{}),...(causeCode?{causeCode}:{}),...(failureCategory?{failureCategory}:{}),
    ...(Number.isInteger(event.httpStatus)&&event.httpStatus!>=100&&event.httpStatus!<=599?{httpStatus:event.httpStatus}:{})}));
  } catch { /* Diagnostics must never change search or permit lifecycle behavior. */ }
 };
 return {correlationId,record:sink};
}
