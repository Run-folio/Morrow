import { readFileSync } from 'node:fs';
import { parseSpreadsheetWorkbook } from '../../lib/easyt/spreadsheet-import-file.ts';
import { buildSpreadsheetImportProposal, canonicalTripFromSpreadsheetProposal } from '../../lib/easyt/spreadsheet-import.ts';
import { acceptedGeographicPlace } from '../../lib/easyt/geographic-binding.ts';
/** Exact owner workbook; geography is synthetic, not a claim about live selected IDs. */
export function philippinesImportFixture() {
 const bytes=readFileSync(new URL('./philippines-import.xlsx',import.meta.url));
 const table=parseSpreadsheetWorkbook(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'route.xlsx').sheets[0]!;
 const proposal=buildSpreadsheetImportProposal(table);
 const points: [number,number][]=[[120.9842,14.5995],[119.4075,11.2027],[123.8558,9.6496],[123.515,9.214],[123.8854,10.3157],[120.9842,14.5995]];
 const places=proposal.stops.map((stop,i)=>{const p={name:stop.name,country:'Philippines',coordinates:points[i]!,providerId:'fixture:'+i,canonicalPlaceId:'fixture:'+i};return {...acceptedGeographicPlace(p,{...p,placeType:'city',routability:'direct_destination'},'stop')!,canonicalPlaceId:p.canonicalPlaceId,coordinates:p.coordinates,country:p.country,sourceStopId:stop.id};});
 return canonicalTripFromSpreadsheetProposal({id:'trip-import-regression',proposal,origin:places[0]!,places,recommendUnbookedTransfers:true});
}
