import {readFileSync} from 'node:fs';
import {parseSpreadsheetWorkbook} from '../../lib/easyt/spreadsheet-import-file.ts';
import {buildSpreadsheetImportProposal,canonicalTripFromSpreadsheetProposal} from '../../lib/easyt/spreadsheet-import.ts';
import {geographicInputKey} from '../../lib/easyt/geographic-binding.ts';
// Public accepted tuples from PHILIPPINES-IMPORT-CAPTURE-20261027.md; no account/private records.
const rows=[
 ['Manila','manila','photon:R:103703',120.9803621,14.5904492,'city'],
 ['El Nido','el-nido','photon:R:16029725',119.390496,11.1800395,'town'],
 ['Tagbilaran City','reference:geonames:1684497','reference:geonames:1684497@699b595afdba9be6994e:PH:city:123.85219:9.65556',123.85219,9.65556,'city'],
 ['Siquijor','open-world:photon:R:3604064','photon:R:3604064',123.5138212,9.2155864,'town'],
 ['Cebu City','cebu-city','photon:R:12455830',123.9018183,10.2934946,'city'],
 ['Manila','manila','photon:R:103703',120.9803621,14.5904492,'city'],
] as const;
export function capturedPhilippinesTrip(){
 const bytes=readFileSync(new URL('./philippines-import.xlsx',import.meta.url));const table=parseSpreadsheetWorkbook(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'route.xlsx').sheets[0]!;
 const proposal=buildSpreadsheetImportProposal(table);
 const places=rows.map(([name,canonicalPlaceId,providerId,lon,lat,placeType],i)=>{const p={name,canonicalPlaceId,providerId,country:'Philippines',coordinates:[lon,lat] as [number,number]};return {...p,geographicBinding:{version:1 as const,source:'provider' as const,canonicalPlaceId,providerId,placeType,country:p.country,routability:'direct_destination' as const,inputKey:geographicInputKey(p)},sourceStopId:proposal.stops[i].id};});
 return canonicalTripFromSpreadsheetProposal({id:'trip-captured-pilot-test',proposal,origin:places[0],places,recommendUnbookedTransfers:true});
}
