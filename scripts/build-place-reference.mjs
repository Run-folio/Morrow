import { createReadStream } from 'node:fs';
import { readFile, mkdir, writeFile, rename, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countries } from '../lib/easyt/country-registry.ts';
const sha = value => createHash('sha256').update(value).digest('hex');
const allowedFeatures = new Set(['PPL', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPLC', 'PPLCD', 'PPLG']);
const allowedAirports = new Set(['large_airport', 'medium_airport', 'small_airport', 'seaplane_base', 'closed_airport']);
const jurisdictions = new Map(countries.map(c => [c.code, c]));
const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const validPoint = p => p.every(Number.isFinite) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
const point = (lon, lat) => lon.trim() && lat.trim() && validPoint([Number(lon), Number(lat)]) ? [Number(lon), Number(lat)] : null;
async function digestFile(path) { const h = createHash('sha256'); for await (const chunk of createReadStream(path))
    h.update(chunk); return h.digest('hex'); }
async function* csvRows(path) { let field = '', row = [], quoted = false, afterQuote = false; for await (const chunk of createReadStream(path, { encoding: 'utf8' }))
    for (const c of chunk) {
        if (quoted) {
            if (c === '"') {
                quoted = false;
                afterQuote = true;
            }
            else
                field += c;
            continue;
        }
        if (afterQuote) {
            afterQuote = false;
            if (c === '"') {
                quoted = true;
                field += '"';
                continue;
            }
        }
        if (c === '"' && !field) {
            quoted = true;
            continue;
        }
        if (c === ',') {
            row.push(field);
            field = '';
        }
        else if (c === '\n') {
            row.push(field);
            yield row;
            row = [];
            field = '';
        }
        else if (c !== '\r')
            field += c;
    } if (quoted)
    throw new Error('Unterminated CSV quoted field'); if (field || row.length) {
    row.push(field);
    yield row;
} }
async function* textLines(path) { let pending = ''; for await (const chunk of createReadStream(path, { encoding: 'utf8' })) {
    pending += chunk;
    let index;
    while ((index = pending.indexOf('\n')) >= 0) {
        yield pending.slice(0, index).replace(/\r$/, '');
        pending = pending.slice(index + 1);
    }
} if (pending)
    yield pending; }
const rank = s => ['PPLC', 'PPLCD'].includes(s.featureCode) ? 0 : s.featureCode?.startsWith('PPLA') || s.featureCode === 'PPLG' ? 1 : 2;
const pack = r => [r.sourceId, r.canonicalName, r.countryCode, ...r.coordinates, r.source === 'ourairports' ? r.airportType : r.featureCode, r.source === 'ourairports' ? r.iataCode ?? '' : r.population ?? 0, r.source === 'ourairports' ? r.icaoCode ?? '' : r.aliases, r.source === 'ourairports' ? r.scheduledService : false, r.source === 'ourairports' ? r.municipality ?? '' : ''];
const seed = r => ({ canonicalPlaceId: r.canonicalPlaceId, canonicalName: r.canonicalName, aliases: [], placeType: r.placeType, routability: 'direct_destination', parentCountries: [jurisdictions.get(r.countryCode).name], coordinates: r.coordinates, captureMode: 'explicit-only', referenceProviderId: r.providerId, provenance: { id: r.providerId, label: 'GeoNames', kind: 'canonical', supports: `Settlement identity from GeoNames (${r.featureCode}); filtered/adapted CC BY 4.0 data, not a travel recommendation.` } });
export async function buildReferenceSnapshot({ airports, settlements, sourceManifest, output, previous }) {
    for (const [id, path] of [['ourairports', airports], ['geonames', settlements]]) {
        const source = sourceManifest.sources.find(s => s.id === id);
        if (!source?.url || !source.license || !source.licenseUrl || source.sha256 !== await digestFile(path))
            throw new Error(`Invalid source manifest/checksum: ${id}`);
    }
    const snapshotId = sha(JSON.stringify({ policy: 'morrovia-reference-v1-aliases8', sources: sourceManifest.sources.map(s => [s.id, s.sha256]) })).slice(0, 20);
    const coverage = Object.fromEntries(countries.map(c => [c.code, { name: c.name, preFilterByFeature: {}, eligible: 0, rejected: 0 }]));
    const rejected = {}, samples = [], aRecords = [], gRecords = [], seen = new Set();
    const reject = (reason, id) => { rejected[reason] = (rejected[reason] ?? 0) + 1; if (samples.length < 100)
        samples.push({ reason, id }); };
    const key = r => `reference:${r.source}:${r.sourceId}@${snapshotId}:${r.countryCode}:${r.placeType}:${r.coordinates.join(':')}`;
    let header;
    for await (const row of csvRows(airports)) {
        if (!header) {
            header = row;
            for (const required of ['id', 'name', 'type', 'iso_country', 'latitude_deg', 'longitude_deg', 'iata_code', 'icao_code'])
                if (!header.includes(required))
                    throw new Error(`Missing airport column ${required}`);
            continue;
        }
        const r = Object.fromEntries(header.map((h, i) => [h, row[i] ?? '']));
        if (!r.id?.trim())
            continue;
        const id = `ourairports:${r.id}`;
        if (seen.has(id))
            throw new Error(`Duplicate source id ${id}`);
        seen.add(id);
        if (!allowedAirports.has(r.type)) {
            reject('airport-type', id);
            continue;
        }
        const coordinates = point(r.longitude_deg, r.latitude_deg);
        if (!coordinates || !r.name.trim()) {
            reject('airport-invalid-point-or-name', id);
            continue;
        }
        const iata = /^[A-Z]{3}$/.test(r.iata_code.trim()) ? r.iata_code.trim() : undefined, icao = /^[A-Z]{4}$/.test(r.icao_code?.trim() ?? '') ? r.icao_code.trim() : undefined;
        if (!iata && !icao) {
            reject('airport-no-code', id);
            continue;
        }
        if (!jurisdictions.has(r.iso_country))
            throw new Error(`Unmapped eligible airport jurisdiction ${r.iso_country} (${id})`);
        const record = { source: 'ourairports', sourceId: r.id, canonicalPlaceId: `reference:ourairports:${r.id}`, canonicalName: r.name.trim(), aliases: [], countryCode: r.iso_country, placeType: 'transport_gateway', coordinates, status: r.type === 'closed_airport' ? 'closed' : 'active', airportType: r.type, scheduledService: r.scheduled_service === 'yes', municipality: r.municipality.trim(), ...(iata ? { iataCode: iata } : {}), ...(icao ? { icaoCode: icao } : {}) };
        record.providerId = key(record);
        aRecords.push(record);
    }
    for await (const line of textLines(settlements)) {
        if (!line.trim())
            continue;
        const f = line.split('\t');
        if (f.length < 19)
            throw new Error('Malformed GeoNames row');
        const [id, name, ascii, alternates, lat, lon, cls, feature, country] = f;
        const sid = `geonames:${id}`;
        if (seen.has(sid))
            throw new Error(`Duplicate source id ${sid}`);
        seen.add(sid);
        if (coverage[country])
            coverage[country].preFilterByFeature[feature] = (coverage[country].preFilterByFeature[feature] ?? 0) + 1;
        if (cls !== 'P' || !allowedFeatures.has(feature)) {
            reject('settlement-feature', sid);
            if (coverage[country])
                coverage[country].rejected++;
            continue;
        }
        const coordinates = point(lon, lat);
        if (!coordinates || !name.trim()) {
            reject('settlement-invalid-point-or-name', sid);
            if (coverage[country])
                coverage[country].rejected++;
            continue;
        }
        if (!jurisdictions.has(country))
            throw new Error(`Unmapped eligible settlement jurisdiction ${country} (${sid})`);
        const aliases = [...new Set([ascii, ...alternates.split(',')].map(s => s.trim()).filter(s => s && s.length <= 80 && normalize(s) !== normalize(name)))].slice(0, 8);
        const r = { source: 'geonames', sourceId: id, canonicalPlaceId: `reference:geonames:${id}`, canonicalName: name, aliases, countryCode: country, placeType: feature === 'PPL' ? 'town' : 'city', coordinates, status: 'active', featureCode: feature, population: Math.max(0, Number(f[14]) || 0) };
        r.providerId = key(r);
        gRecords.push(r);
        coverage[country].eligible++;
    }
    aRecords.sort((a, b) => Number(a.sourceId) - Number(b.sourceId));
    gRecords.sort((a, b) => Number(a.sourceId) - Number(b.sourceId));
    let oldSeeds = [], retiredSeeds = [];
    if (previous) {
        try {
            oldSeeds = Object.values(JSON.parse(await readFile(resolve(previous, 'country-seeds.json'), 'utf8'))).flat();
            retiredSeeds = JSON.parse(await readFile(resolve(previous, 'retired-seeds.json'), 'utf8'));
        }
        catch (e) {
            if (e.code !== 'ENOENT')
                throw e;
        }
    }
    const oldById = new Map([...retiredSeeds, ...oldSeeds].map(r => [r.canonicalPlaceId, r]));
    const currentById = new Map(gRecords.map(r => [r.canonicalPlaceId, r]));
    const quarantined = [];
    for (const old of oldById.values()) {
        const current = currentById.get(old.canonicalPlaceId);
        const changed = current && (old.canonicalName !== current.canonicalName || old.parentCountries[0] !== jurisdictions.get(current.countryCode).name || old.placeType !== current.placeType || JSON.stringify(old.coordinates) !== JSON.stringify(current.coordinates));
        if (!current || changed) {
            if (changed) {
                current.status = 'quarantined';
                quarantined.push({ canonicalPlaceId: current.canonicalPlaceId, reason: 'published-seed-facts-changed' });
            }
            retiredSeeds = retiredSeeds.filter(r => r.canonicalPlaceId !== old.canonicalPlaceId);
            retiredSeeds.push(old);
        }
    }
    const countrySeeds = Object.fromEntries(countries.map(c => [c.code, gRecords.filter(r => r.countryCode === c.code && r.status === 'active').sort((a, b) => rank(a) - rank(b) || b.population - a.population || Number(a.sourceId) - Number(b.sourceId)).slice(0, 8).map(seed)]));
    const collisions = {};
    for (const r of aRecords)
        for (const code of [r.iataCode, r.icaoCode].filter(Boolean))
            (collisions[code] ??= []).push(r.canonicalPlaceId);
    const duplicateCodes = Object.fromEntries(Object.entries(collisions).filter(([, ids]) => ids.length > 1));
    const payloads = { 'airports.json': aRecords.map(pack), 'settlements.json': gRecords.filter(r => r.status === 'active').map(pack), 'country-seeds.json': countrySeeds, 'code-kinds.json': { iata: [...new Set(aRecords.filter(r => r.status === 'active').map(r => r.iataCode).filter(Boolean))].sort(), metro: ['NYC', 'SEL'] }, 'retired-seeds.json': retiredSeeds.sort((a, b) => a.canonicalPlaceId.localeCompare(b.canonicalPlaceId)), 'crosswalk.json': { version: 1, mappings: [] }, 'coverage.json': { jurisdictions: coverage, rejected, samples, duplicateCodes, quarantined, exceptions: countries.filter(c => !countrySeeds[c.code].length).map(c => ({ code: c.code, ...coverage[c.code], reason: coverage[c.code].eligible ? 'quarantined-only-review-required' : 'no-eligible-source-settlement', extract: 'cities500 thresholded; no eligible row is not proof of no inhabitants' })) } };
    const activeSettlements = gRecords.filter(r => r.status === 'active');
    const prefixes = new Map();
    let byteOffset = 2;
    const lines = [];
    const lengths = Buffer.alloc(activeSettlements.length * 2);
    for (const r of activeSettlements) {
        const line = JSON.stringify(pack(r));
        const length = Buffer.byteLength(line) + 2;
        if (length > 65535) throw new Error('Settlement record exceeds compact index range');
        lengths.writeUInt16LE(length, lines.length * 2);
        lines.push(line);
        const keys = new Set([r.canonicalName, ...r.aliases].flatMap(name => { const n = normalize(name); return [n, ...n.split(' ')].filter(word => word.length >= 2).map(word => word.slice(0, 2)); }));
        for (const key of keys) {
            if (!prefixes.has(key))
                prefixes.set(key, []);
            prefixes.get(key).push(byteOffset);
        }
        byteOffset += Buffer.byteLength(line) + 2;
    }
    const settlementBody = '[\n' + lines.join(',\n') + '\n]\n';
    const directory = {};
    const offsets = [];
    for (const [prefix, values] of [...prefixes].sort(([a], [b]) => a.localeCompare(b))) {
        directory[prefix] = { offset: offsets.length * 4, count: values.length };
        offsets.push(...values);
    }
    const binary = Buffer.alloc(offsets.length * 4);
    offsets.forEach((value, index) => binary.writeUInt32LE(value, index * 4));
    const files = Object.entries(payloads).map(([path, data]) => ({ path, body: path === 'settlements.json' ? settlementBody : JSON.stringify(data) + '\n', records: Array.isArray(data) ? data.length : Object.keys(data).length }));
    files.push({ path: 'settlement-prefixes.json', body: JSON.stringify(directory) + '\n', records: Object.keys(directory).length }, { path: 'settlement-prefixes.bin', body: binary, records: offsets.length }, {path:'settlement-lengths.bin',body:lengths,records:activeSettlements.length});
    const total = files.reduce((n, f) => n + Buffer.byteLength(f.body), 0);
    if (total > 32 * 1024 * 1024)
        throw new Error(`Reference file budget exceeded: ${total}`);
    const manifest = { version: 1, generatorVersion: '1', snapshotId, generatedAt: sourceManifest.acquiredAt, sources: sourceManifest.sources.map(s => ({ ...s, acquiredAt: s.acquiredAt ?? sourceManifest.acquiredAt })), files: files.map(f => ({ path: f.path, sha256: sha(f.body), records: f.records, bytes: Buffer.byteLength(f.body) })) };
    const candidate = `${output}.candidate-${process.pid}`;
    await mkdir(candidate, { recursive: true });
    try {
        for (const f of files)
            await writeFile(resolve(candidate, f.path), f.body);
        await writeFile(resolve(candidate, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
        await writeFile(resolve(candidate, 'LICENSES.md'), '# Place reference data\n\nOurAirports: public domain. https://ourairports.com/data/\n\nGeoNames: CC BY 4.0. https://www.geonames.org/ — https://creativecommons.org/licenses/by/4.0/\nFiltered and adapted by Morrovia: eligible features, compact fields, bounded aliases and initial country identities. Source data is provided without accuracy/completeness warranty.\n');
        await mkdir(dirname(output), { recursive: true });
        let exists = false;
        try {
            await stat(output);
            exists = true;
        }
        catch (e) {
            if (e.code !== 'ENOENT')
                throw e;
        }
        const backup = `${output}.previous-${process.pid}`;
        if (exists) {
            const owned = JSON.parse(await readFile(resolve(output, 'manifest.json'), 'utf8'));
            if (owned.version !== 1)
                throw new Error('Refuse replacing unowned output directory');
            await rename(output, backup);
        }
        try {
            await rename(candidate, output);
        }
        catch (e) {
            if (exists)
                await rename(backup, output);
            throw e;
        }
        if (exists)
            await rm(backup, { recursive: true, force: true });
    }
    catch (e) {
        await rm(candidate, { recursive: true, force: true });
        throw e;
    }
    return { manifest, airports: aRecords, settlements: gRecords, countrySeeds, retiredSeeds, coverage, diff: { quarantined }, rejected, totalBytes: total };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = Object.fromEntries(process.argv.slice(2).reduce((rows, value, i, list) => i % 2 ? rows : [...rows, [value.replace(/^--/, ''), list[i + 1]]], []));
    const sourceManifest = JSON.parse(await readFile(args['source-manifest'], 'utf8'));
    const r = await buildReferenceSnapshot({ airports: args.airports, settlements: args.settlements, sourceManifest, previous: args.previous, output: resolve(args.output) });
    console.log(JSON.stringify({ snapshot: r.manifest.snapshotId, airports: r.airports.length, settlements: r.settlements.length, seedCountries: Object.values(r.countrySeeds).filter(s => s.length).length, bytes: r.totalBytes, rejected: r.rejected }, null, 2));
}
