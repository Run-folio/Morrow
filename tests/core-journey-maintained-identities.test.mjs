import test from 'node:test';
import assert from 'node:assert/strict';
import {maintainedCoreDestinations} from './fixtures/core-journey-destinations.ts';
import {autocompleteRender, selectHomepageEntry} from './helpers/autocomplete-component.mjs';
import {addStopSelection} from './helpers/builder-add-stop-selection.mjs';
import {emptyHomepageInput} from './fixtures/homepage-dual-entry.ts';
import {searchReferencePlaces} from '../lib/easyt/place-reference.server.ts';
import {REFERENCE_SNAPSHOT_ID} from '../lib/easyt/place-reference.ts';
import {projectHomepageInput, readHomepageInput} from '../lib/easyt/home-trip-handoff.ts';
import {requireReadableTripDocument, prepareTripDocumentForWrite} from '../lib/easyt/trip-document.ts';
import {geographicallyReady, stopGeographicPlace} from '../lib/easyt/geographic-binding.ts';

const wire = value => JSON.parse(JSON.stringify(value));
const legacyPoints = [[-3.7038,40.4168],[-9.1393,38.7223],[-8.6291,41.1579]];
const facts = place => ({id:place.canonicalPlaceId,name:place.name,country:place.country,coordinates:place.coordinates});

for (const [index, expected] of maintainedCoreDestinations.entries()) {
  const legacy = {canonicalPlaceId:expected.name.toLowerCase(),name:expected.name,country:expected.country,
    countryCode:expected.countryCode,coordinates:legacyPoints[index],providerId:`core-fixture:${expected.name.toLowerCase()}`,
    placeType:'city',kind:'city',routability:'direct_destination',matchQuality:'exact',rankScore:200};
  const api = async () => ({status:200,body:{candidates:[legacy],result:legacy}});

  for (const mode of ['maintained','explicit legacy']) test(`${expected.name}: ${mode} selection preserves its own tuple through actual callbacks and model reopen`, async () => {
    const published = searchReferencePlaces(expected.name).find(place => place.canonicalPlaceId === expected.canonicalPlaceId);
    assert.ok(published);
    assert.deepEqual({name:published.canonicalName,country:published.parentCountries[0],coordinates:published.coordinates,type:published.placeType},
      {name:expected.name,country:expected.country,coordinates:[...expected.coordinates],type:'city'});
    const view = autocompleteRender(expected.name,{api});
    let selected;
    try {
      await view.settle();
      if (mode === 'maintained') {
        view.rows()[0].choose(); selected = view.selected.at(-1);
        assert.equal(selected.canonicalPlaceId,expected.canonicalPlaceId,'same first-option action as failing CI selects the maintained city');
      } else {
        for (const row of view.rows()) {
          row.choose(); const candidate = view.selected.at(-1);
          if (candidate.canonicalPlaceId === legacy.canonicalPlaceId && candidate.coordinates) { selected = candidate; break; }
        }
      }
      assert.ok(selected);
      const before = wire(selected), entry = selectHomepageEntry(selected);
      const restored = readHomepageInput(wire({snapshot:{...emptyHomepageInput(),entries:[entry]}}),null);
      assert.ok(restored); assert.deepEqual(wire(restored.snapshot.entries[0].selection),before);
      const projected = projectHomepageInput({snapshot:restored.snapshot,profile:null,handoffId:'existing-core-contract'});
      assert.equal(projected.ok,true);
      assert.equal(projected.draft.routeIntent.destinations[0].selectedPlace.canonicalPlaceId,selected.canonicalPlaceId);
      const added = await addStopSelection(expected.name,selected,{api});
      assert.deepEqual(added.errors,[]); assert.deepEqual(added.missing,[]); assert.equal(added.ready,true);
      const original = requireReadableTripDocument(added.savedTrip);
      const reopened = requireReadableTripDocument(wire(prepareTripDocumentForWrite(original)));
      assert.deepEqual(reopened.stops,original.stops,'serialization does not remap any existing or selected stop');
      assert.deepEqual(reopened.brief.intent.route,original.brief.intent.route);
      const stop = reopened.stops.find(stop=>stop.id===added.result.id); assert.ok(stop);
      const place = stopGeographicPlace(stop); assert.equal(geographicallyReady(place),true);
      assert.deepEqual(facts(place),facts(mode==='maintained'?expected:legacy));
      if (mode==='maintained') {
        assert.equal(place.providerId,`reference:geonames:${expected.canonicalPlaceId.split(':')[2]}@${REFERENCE_SNAPSHOT_ID}:${expected.countryCode}:city:${expected.coordinates.join(':')}`);
      } else assert.equal(place.providerId,legacy.providerId,'explicit legacy selection is not adopted into current reference identity');
      assert.deepEqual(wire(selected),before);
    } finally {view.close();}
  });
}
