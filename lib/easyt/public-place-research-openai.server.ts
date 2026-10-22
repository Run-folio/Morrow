import 'server-only';
import {defaultPlaceResearchControls,runAdmittedPlaceResearch} from './public-place-research-controls.server.ts';
import {getOpenAIClient} from './openai.server';
import {createPublicPlaceAliasRequest} from './public-place-alias-request.ts';

/** One tool-free generation; no counting endpoint, sources, history or other model changes. */
export async function researchPublicPlaceNames(query:string,country:string|undefined,signal:AbortSignal):Promise<unknown> {
  if(signal.aborted)throw new Error('Place alias request cancelled');
  const request=createPublicPlaceAliasRequest(query,country);
  // Durable admission precedes key/client initialization; uncertain charges stay reserved.
  return runAdmittedPlaceResearch(defaultPlaceResearchControls(),signal,async()=>{
    if(signal.aborted)throw new Error('Place alias request cancelled');
    const client=getOpenAIClient();
    if(signal.aborted)throw new Error('Place alias request cancelled');
    return client.responses.create(request,{signal,maxRetries:0});
  });
}
