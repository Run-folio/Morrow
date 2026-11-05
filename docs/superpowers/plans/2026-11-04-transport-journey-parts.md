# Saved transport parts and missing travel details

Approved scope: presentation only. Show explicit saved segments in order and identify gaps around a saved flight chain. Reuse the existing Matsumoto departure-airport handoff limitation for city-only flight details. Never choose an airport, transfer mode, timing or service. Preserve all persisted data, booking controls and provider links.

1. Add pure, defensive saved-parts projection with tests for complete chains, omitted access/onward travel, interchanges, legacy Matsumoto, malformed input and immutability.
2. Compose an ordered list inside existing Journey details and show missing-details notices beside existing actions. Reuse current controls, typography and spacing tokens; English/Spanish copy and representative stories.
3. Verify focused transport/persistence tests, typecheck, UI audit and build. Check synthetic exact 320px EN/ES, keyboard details, reload/edit and rendered provider links using isolated local tooling; no deployment or real user data.
4. Review the bounded diff independently, record evidence and remaining hosted/provider gates.
