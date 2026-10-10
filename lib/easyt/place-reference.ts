import seeds from '../../data/place-reference/country-seeds.json' with { type: 'json' };
import codes from '../../data/place-reference/code-kinds.json' with { type: 'json' };
import retired from '../../data/place-reference/retired-seeds.json' with { type: 'json' };
import manifest from '../../data/place-reference/manifest.json' with {type:'json'};
import { countryCodeFor } from './country-registry.ts';
import type { PlaceCatalogEntry } from './place-catalog.ts';
export type ReferencePlaceRecord = {
    source: 'ourairports' | 'geonames';
    sourceId: string;
    canonicalPlaceId: string;
    providerId: string;
    canonicalName: string;
    aliases: readonly string[];
    countryCode: string;
    placeType: 'city' | 'town' | 'transport_gateway';
    coordinates: readonly [
        number,
        number
    ];
    status: 'active' | 'closed' | 'quarantined';
    iataCode?: string;
    icaoCode?: string;
    scheduledService?: boolean;
    population?: number;
    featureCode?: string;
    adminCodes?: readonly string[];
    photoRequiresCoordinates?: boolean;
    airportType?: string;
    municipality?: string;
};
export type ReferenceSnapshotManifest = {
    version: 1;
    generatorVersion?: string;
    snapshotId: string;
    generatedAt: string;
    sources: readonly {
        id: string;
        url: string;
        acquiredAt: string;
        sourcePublishedAt?: string;
        sha256: string;
        license: string;
        licenseUrl: string;
    }[];
    files: readonly {
        path: string;
        sha256: string;
        records: number;
        bytes: number;
    }[];
};
export const referenceRecordKey = (record: Pick<ReferencePlaceRecord, 'source' | 'sourceId' | 'placeType' | 'countryCode' | 'coordinates'>, snapshotId: string) => `reference:${record.source}:${record.sourceId}@${snapshotId}:${record.countryCode}:${record.placeType}:${record.coordinates.join(':')}`;
export function referenceSelectionMatches(candidate: {
    canonicalPlaceId: string;
    providerId: string;
    country: string;
    placeType: string;
    coordinates: readonly [
        number,
        number
    ];
}, record: ReferencePlaceRecord, snapshotId: string) {
    return record.status === 'active' && candidate.canonicalPlaceId === record.canonicalPlaceId
        && candidate.providerId === referenceRecordKey(record, snapshotId) && record.providerId === candidate.providerId
        && countryCodeFor(candidate.country) === record.countryCode && candidate.placeType === record.placeType
        && candidate.coordinates.length === 2 && candidate.coordinates.every((value, index) => Number.isFinite(value) && value === record.coordinates[index])
        && Math.abs(candidate.coordinates[0]) <= 180 && Math.abs(candidate.coordinates[1]) <= 90;
}
export const REFERENCE_COUNTRY_SEEDS = Object.values(seeds).flat() as unknown as readonly PlaceCatalogEntry[];
export const REFERENCE_RETIRED_SEEDS = retired as unknown as readonly PlaceCatalogEntry[];
const seedCountries = seeds as unknown as Record<string, readonly PlaceCatalogEntry[]>;
const iata = new Set(codes.iata), icao = new Set(codes.icao), metro = new Set(codes.metro);
const retiredIds = new Set(REFERENCE_RETIRED_SEEDS.map(seed => seed.canonicalPlaceId));
export const referenceCountrySeeds = (code: string) => seedCountries[code.toUpperCase()] ?? [];
export const referenceSeedRetired = (id: string) => retiredIds.has(id);
export function referenceKnownCodeKind(query: string): 'iata' | 'icao' | 'metro' | undefined { const code = query.trim().toUpperCase(); return metro.has(code) ? 'metro' : iata.has(code) ? 'iata' : icao.has(code) ? 'icao' : undefined; }
export const REFERENCE_SNAPSHOT_ID=manifest.snapshotId;
/** An old browser can keep saved facts but cannot accept new evidence from a different snapshot. */
export function referenceResponseCompatible(candidate:{providerId?:string;referenceSnapshotId?:string}){
 if(!candidate.providerId?.startsWith('reference:'))return true;
 return candidate.referenceSnapshotId===REFERENCE_SNAPSHOT_ID&&candidate.providerId.split('@')[1]?.split(':')[0]===REFERENCE_SNAPSHOT_ID;
}

/** Validate new reference evidence without loading the world dataset into the browser.
 * Historical saved bindings deliberately do not use this acceptance gate. */
export function referenceGeographicAcceptanceMatches(candidate: {
 canonicalPlaceId?:string;providerId?:string;referenceSnapshotId?:string;
 country?:string;placeType?:string;kind?:string;coordinates?:readonly number[];
}) {
 const referenceId=candidate.canonicalPlaceId?.startsWith('reference:');
 if(!referenceId&&!candidate.providerId?.startsWith('reference:'))return true;
 if(!referenceResponseCompatible(candidate))return false;
 const identity=/^reference:(ourairports|geonames):([1-9][0-9]*)$/.exec(candidate.canonicalPlaceId??'');
 const type=candidate.placeType??candidate.kind,point=candidate.coordinates,iso=countryCodeFor(candidate.country);
 if(!identity||!iso||!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite)||Math.abs(point[0])>180||Math.abs(point[1])>90)return false;
 if(identity[1]==='ourairports'?type!=='transport_gateway':type!=='city'&&type!=='town')return false;
 return candidate.providerId===referenceRecordKey({source:identity[1] as ReferencePlaceRecord['source'],sourceId:identity[2],countryCode:iso,placeType:type as ReferencePlaceRecord['placeType'],coordinates:[point[0],point[1]]},REFERENCE_SNAPSHOT_ID);
}
