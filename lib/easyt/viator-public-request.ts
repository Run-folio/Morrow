import type { ViatorProductSearchInput } from './viator-affiliate.server.ts';

export class ViatorPublicInputError extends Error {
  constructor(readonly status = 400, readonly reason: 'invalid_input' | 'identity_required' = 'invalid_input') { super('Invalid activity search.'); }
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new ViatorPublicInputError();
}
function text(value: unknown, maximum: number, required = false): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ViatorPublicInputError();
    return undefined;
  }
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) throw new ViatorPublicInputError();
  return value.trim();
}

/** Check bytes as they arrive; Content-Length alone cannot bound a public body. */
export async function readViatorPublicRequest(request: Request): Promise<ViatorProductSearchInput> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new ViatorPublicInputError(415);
  if (Number(request.headers.get('content-length')) > 16_384) throw new ViatorPublicInputError(413);
  const reader = request.body?.getReader();
  if (!reader) throw new ViatorPublicInputError();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 16_384) { await reader.cancel(); throw new ViatorPublicInputError(413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let body: unknown;
  try {
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    body = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes));
  } catch { throw new ViatorPublicInputError(); }
  if (!record(body) || !record(body.destination)) throw new ViatorPublicInputError();
  keys(body, ['workspace', 'destination', 'currency', 'locale']);
  const workspace = body.workspace ?? 'itinerary';
  if (workspace !== 'map' && workspace !== 'itinerary') throw new ViatorPublicInputError();
  const value = body.destination;
  keys(value, ['canonicalPlaceId', 'name', 'country', 'countryCode', 'region', 'placeType', 'aliases', 'coordinates', 'providerId']);
  if (typeof value.canonicalPlaceId !== 'string' || !value.canonicalPlaceId.trim()) throw new ViatorPublicInputError(400,'identity_required');
  const canonicalPlaceId = text(value.canonicalPlaceId,160,true)!;
  const name = text(value.name,120,true)!;
  const country = text(value.country,80,true)!;
  const countryCode = text(value.countryCode,2)?.toUpperCase();
  if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) throw new ViatorPublicInputError();
  const region = text(value.region,120), placeType = text(value.placeType,40);
  text(value.providerId,200); // Existing browser identity hint; never a provider destination ID.
  let aliases: string[] | undefined;
  if (value.aliases !== undefined) {
    if (!Array.isArray(value.aliases) || value.aliases.length > 16) throw new ViatorPublicInputError();
    aliases = value.aliases.map(alias => text(alias,120,true)!);
  }
  let coordinates: {latitude:number;longitude:number} | undefined;
  if (value.coordinates !== undefined) {
    if (!record(value.coordinates)) throw new ViatorPublicInputError();
    keys(value.coordinates,['latitude','longitude']);
    const {latitude,longitude} = value.coordinates;
    if (typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude)>90 || typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude)>180) throw new ViatorPublicInputError();
    coordinates={latitude,longitude};
  }
  const localeInput = text(body.locale,5)?.replace('_','-').toLowerCase() ?? 'en-us';
  const locale = ({en:'en', 'en-us':'en-US', 'en-gb':'en-GB', es:'es', 'es-es':'es-ES'} as Record<string,string>)[localeInput];
  const currency = text(body.currency,3)?.toUpperCase() ?? 'USD';
  if (!locale || !['GBP','USD','EUR','AUD','CAD','NZD','CHF','JPY'].includes(currency)) throw new ViatorPublicInputError();
  return {destination:{canonicalPlaceId,name,country,...(countryCode?{countryCode}:{}),...(region?{region}:{}),...(placeType?{placeType}:{}),...(aliases?{aliases}:{}),...(coordinates?{coordinates}:{})},count:workspace === 'map' ? 12 : 4,locale,currency};
}
