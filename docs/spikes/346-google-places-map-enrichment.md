# #346 Google Places Map enrichment — local vertical slice

Starting point: `f6dd263550d3eccdd9bbf388423d0fa2e6882668`. This is post-MVP work in a separate local branch. It does not alter the MapLibre route canvas or the canonical trip document.

## Decision and boundary

The traveller's job is to assess a few nearby places without losing the multi-stop route context. The expanded authenticated Map has an explicit **Explore with Google Maps** mode inside its existing finder dock. It presents a list and selected detail beside the current MapLibre map. It never plots Google Places results as MapLibre pins: [Google's Places policy](https://developers.google.com/maps/documentation/places/web-service/policies) says Places results displayed on a map must use a Google map. This preserves the current Morrovia route, pins, camera and itinerary owner.

The server-side `PlaceEnrichmentProvider` has `nearby` and `details` methods. Google responses are normalized to ephemeral `EnrichedPlace` values: provider place ID, name, coordinates, broad category, address, Google Maps URL, and optional rating, count, price level, opening state/hours, website, photo availability and attribution. These types do not enter `EasyTTrip`. The client sees no API key. The feature is disabled unless both `MORROVIA_GOOGLE_PLACE_ENRICHMENT=enabled` and `GOOGLE_PLACES_API_KEY` are present; the endpoint also requires an authenticated owner. Availability, nearby and detail responses are private and `no-store`. Any provider error returns an unavailable state; Map remains usable.

## Google requests

- Opening Map: one Morrovia availability request, **zero Google requests**.
- Entering the mode: one `POST https://places.googleapis.com/v1/places:searchNearby` via the server. Bounded to a 5 km circle, 10 results, and one of See, Eat, Stay or Practical type sets. The field mask omits ratings, photos, hours and website to keep list searches in the **Nearby Search Pro** field tier.
- Selecting a result: one `GET https://places.googleapis.com/v1/places/{id}` via the server. The field mask requests rating, count, price level, current opening hours and website; these make it a **Place Details Enterprise** request. It also requests photo availability, but no photo media is loaded in this slice.
- Switching destination or category while the mode is open: another nearby call. Returning later: fresh calls. Repeated selection of the same already open result does not repeat the detail request. Leaving a destination/category cancels its in-flight request.

The API paths, field masks and SKU tiers follow Google's [Nearby Search](https://developers.google.com/maps/documentation/places/web-service/nearby-search), [Place Details](https://developers.google.com/maps/documentation/places/web-service/place-details) and [field selection](https://developers.google.com/maps/documentation/places/web-service/choose-fields) documentation. Current monetary rates must be taken from the live [Google Maps Platform pricing list](https://developers.google.com/maps/billing-and-pricing/pricing); rates, free usage and account contracts are external assumptions, not application constants.

### Request model: Tokyo → Kanazawa → Kyoto → Osaka

| Interaction | App calls | Google Nearby Pro | Google Details Enterprise |
| --- | ---: | ---: | ---: |
| Open Map and check availability | 1 | 0 | 0 |
| Open See in Tokyo | 0 | 1 | 0 |
| Switch to each of three further stops with mode open | 0 | 3 | 0 |
| Open two details per stop | 0 | 0 | 8 |
| Change category twice during the trip | 0 | 2 | 0 |
| Return to Map later, open discovery and two details | 1 | 1 | 2 |
| **Total for this usage pattern** | **2** | **7** | **10** |

This pattern yields **12 Google calls in the first active Map session** and **17 across the trip including the return**. The cost expression is `7 × current Nearby Search Pro unit price + 10 × current Place Details Enterprise unit price`, subject to the account's live pricing and usage terms. Photos would add a Place Details IDs-only refresh and Place Photo media request per selected image if enabled later. Details are the dominant cost opportunity: do not load them for the whole list.

## Terms and storage

Google [permits indefinite storage of Place IDs](https://developers.google.com/maps/documentation/places/web-service/policies) but restricts caching or storing other Places content. This slice stores **no** Google result, photo, review, rating or hours in a trip or server cache. A list/detail lives only in the open React component and disappears when the mode closes. No raw reviews are requested. The panel labels Google Maps content, links outward, and displays any detail attributions returned by the API. It does not display a photo: the existing photo proxy supplies author attribution, but this slice does not yet prove the required direct access to the individual source photo on Google Maps. No broken or unattributed image is shown.

The `Google Maps` attribution uses Google's required neutral text color as a narrow CSS exception to the Morrovia palette. The list, controls and surrounding panel use Morrovia components and tokens.

Adding to itinerary is intentionally deferred. The existing itinerary idea path persists place name and coordinates; applying it to Google-derived content would need a confirmed persistence interpretation and a Place ID refresh flow. The integration point remains the existing `scheduleItineraryIdea` / shell mutation owner. A future version should save the traveller's explicit choice and permitted identity only, then refresh provider facts at display time. Legal/privacy review should confirm the public Terms and Privacy links and any EEA-specific contract before beta enablement.

## Rollout recommendation

Keep the flag off by default. First validate the fixture list/detail states and mobile layout locally. A limited authenticated beta may follow after account billing limits, photo/source-link and itinerary persistence decisions, and a live-key acceptance pass. Do not extend Google to route overview, Builder, public previews or site-wide maps on this evidence alone.
