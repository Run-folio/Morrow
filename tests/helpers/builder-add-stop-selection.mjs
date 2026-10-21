import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { canonicalPlaceSuggestionsForQuery, placeSuggestionRequiresBaseSelection, isOvernightBaseEligible, canonicalPlaceFactsMatch, validPlaceCoordinates } from '../../lib/easyt/place-intelligence.ts';
import { isDuplicatePlaceIdentity } from '../../lib/easyt/place-autocomplete.ts';
import { countryCodeFor } from '../../lib/easyt/country-registry.ts';
import { acceptedGeographicPlace, stopGeographicPlace, geographicallyReady } from '../../lib/easyt/geographic-binding.ts';
import { canonicalRouteFixture } from '../../tests/fixtures/batch14-route-documents.ts';
import { requireReadableTripDocument } from '../../lib/easyt/trip-document.ts';
import { builderPlaceCommand, prepareBuilderHandlerEdit } from '../../lib/easyt/trip-builder-handler-contract.ts';
import { builderDocumentFingerprint } from '../../lib/easyt/trip-builder-document-commit.ts';

// Extract the unchanged, actual component handler. All state and API calls below
// are synthetic in memory; fixtureResponse is invoked directly without fetch.
const require = createRequire(new URL('../../package.json', import.meta.url));
const ts = require('typescript');
const source = readFileSync(new URL('../../app/journey/new/trip-builder.tsx', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('  const addStop = async ('), source.indexOf('  const addSupportedBase ='));
const compiled = ts.transpileModule(`${body}\nreturn addStop;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

export async function addStopSelection(label, suggestion, {raw = suggestion?.name ?? '', api, seedTrip, changeReview} = {}) {
  let trip = requireReadableTripDocument(seedTrip ?? canonicalRouteFixture()), revision = 1;
  const log = { label, requests: [], review: null, errors: [], acceptedInputs: [], commands: [], missing: [], result: null };
  const scope = {
    stopInput: raw, resolvingPlaceMentionId: null, language: 'en',
    capturedStructuredBrief: trip.brief.structuredBrief ?? { destinations: [], placeMentions: [] }, intakeMentions: trip.brief.structuredBrief?.placeMentions ?? [], placeSelections: [],
    stops: trip.stops.map(stop => ({ ...stopGeographicPlace(stop), id: stop.id })),
    countryAddReviewRef: { current: null }, addPlaceLookupSequenceRef: { current: 0 },
    activeBrowserOwnerIdRef: { current: 'owner-a' }, handoffOccurrenceMentionIdsRef: { current: {} },
    builderEditSessionRef: { current: { getSnapshot: () => ({ trip, inputRevision: revision, browserOwnerId: 'owner-a',
      draft: { fields: [{ binding: { kind: 'destination-add' }, status: 'editable', raw: scope.stopInput }] } }) } },
    ui: { typePlace: 'Type a place', unavailable: 'unavailable' },
    isDuplicatePlaceIdentity, placeSuggestionRequiresBaseSelection, isOvernightBaseEligible, countryCodeFor,
    canonicalPlaceFactsMatch, validPlaceCoordinates, geographicallyReady, stopGeographicPlace, builderPlaceCommand,
    acceptedGeographicPlace: (owner, candidate) => {
      const accepted = acceptedGeographicPlace(owner, candidate);
      log.acceptedInputs.push({ owner, candidate, accepted: Boolean(accepted) }); return accepted;
    },
    fetch: async input => {
      const url = new URL(input, 'http://fixture.invalid'); log.requests.push(url.pathname + url.search);
      const response = await api({ pathname: url.pathname, searchParams: url.searchParams });
      return { json: async () => JSON.parse(JSON.stringify(response.body)), ok: response.status === 200, status: response.status };
    },
    setCountryAddReview: review => { log.review = review; },
    setStopError: value => { if (value) log.errors.push(value); },
    setStopChecking: () => {}, rememberStructuralChange: () => {},
    setRemovedPlaceMentionIds: () => {}, setStopInput: value => { scope.stopInput = value; },
    setShowStopEditor: () => {}, setStopSearchReadyKey: () => {},
    dispatchAcceptedBuilderEdits: async (commands, options) => {
      if (options.expectedInputRevision !== revision) throw Error('unexpected revision');
      for (const command of commands) {
        const result = prepareBuilderHandlerEdit(trip, command, builderDocumentFingerprint(trip));
        if (!result.ok) throw Error(JSON.stringify(result)); trip = result.trip;
      }
      revision++; log.commands.push(...commands); return true;
    },
  };
  scope.cancelCountryAddReview = () => { scope.countryAddReviewRef.current = null; scope.addPlaceLookupSequenceRef.current++; };
  scope.beginPlanningAreaClarification = async selection => { log.area = selection.canonicalPlaceId; };
  const proxy = new Proxy(scope, {
    has: (target, key) => key !== 'scope',
    get: (target, key) => key === Symbol.unscopables ? undefined : key in target ? target[key]
      : key in globalThis ? globalThis[key] : (log.missing.push(String(key)), undefined),
  });
  const addStop = new Function('scope', `with(scope){${compiled}}`)(proxy);
  const selected = await addStop(suggestion?.name, suggestion?.country, undefined, undefined, suggestion);
  if (scope.countryAddReviewRef.current) {
    const review = scope.countryAddReviewRef.current;
    log.reviewTuple = structuredClone(review.resolved);
    changeReview?.(review, scope);
    log.result = await addStop(review.name, review.country, undefined, undefined, review.suggestion, false, review);
  } else log.result = selected;
  log.ready = log.result ? geographicallyReady(log.result) : false;
  log.savedTrip = JSON.parse(JSON.stringify(trip));
  delete log.review;
  return log;
}
