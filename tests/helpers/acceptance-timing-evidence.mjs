// Test-only evidence: does not select a threshold or alter the measured interval.
import {join} from 'node:path';

export function acceptanceWindowEvidence(record,tasks){
 if(!record||!Number.isFinite(record.start)||!Number.isFinite(record.end)||record.end<record.start)throw new TypeError('Incomplete acceptance timing');
 return {start:record.start,end:record.end,elapsedMs:record.end-record.start,
  longTasks:tasks.filter(task=>task.start<record.end&&task.start+task.duration>record.start).map(task=>({start:task.start,duration:task.duration}))};
}

export function timingTraceOptions(directory,name,retainTimingFailure){
 return retainTimingFailure?{path:join(directory,`${name}-timing.zip`)}:undefined;
}
