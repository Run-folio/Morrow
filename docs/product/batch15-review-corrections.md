# Batch15 second review corrections

These corrections follow independent review of checkpoint `53c7758`. They do
not establish staging or product acceptance.

- Generated multimodal compositions are reevaluated against changed hard
  transport constraints. Forbidden segments and crossing evidence are removed;
  traveller constraints, context and endpoints remain intact.
- Commons filename indexing words are separated from the grammatical transit
  subject when an actual caption exists. Filename-only ferry evidence remains
  disqualifying. Exact short administrative labels use the same token-boundary
  identity check as longer labels; GPS alone remains insufficient.
- Photo cache writes require a live consumer of the current eligible request.
  Overlapping request groups retire after settlement, preserve newer committed
  selection ownership, and permit a live consumer to rejoin pending work when
  intervening consumers have cancelled. Cancelled consumers do not receive
  callbacks; a lone cancelled lookup cannot warm or track the cache.
- Local place image credits use the existing Overview displayed-source pattern:
  loaded image, error fallback without credit, replacement source then restored
  credit after load. Existing `ResilientImage` and `MorroviaPhotoCredit` are reused.
- Transport's unchanged client workspace wrapper is imported by a server page.
  Next 15.5.21's FlightManifestPlugin incorrectly tests a concatenated module ID
  for truthiness, omitting valid ID `0`; the frozen Transport artifact received
  that ID. This composition avoids the current omission without a dependency
  patch or global bundler change. The underlying framework bug remains.

`build:check` now verifies production RSC entries for client page boundaries and
direct default client component imports. It checks the current 14 boundaries.
The exact integrated artifact must also pass a real production Transport
response check and enabled functional browser regression.

Existing benchmark fixtures and thresholds are unchanged. The inherited Manila
cross-source equivalence still lacks substantiating provenance. Five frozen
transport benchmark cases, geographic readiness at road-estimation boundaries,
saved-location context, broader persistence failures and photo editorial gates
remain explicit review work; replacement canonical controls do not qualify
their original fixtures. No calendar/reliability integration or deployment is
included in this correction.
