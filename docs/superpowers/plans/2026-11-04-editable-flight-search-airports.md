# Editable flight-search airports

Scope approved by Shaun: editable airport planning without claiming live services or changing canonical route/booking state. Reuse CanonicalPlaceAutocomplete, EasyT controls and shared canonical mutations. Existing approved Paris/London defaults remain; no automatic Matsumoto gateway is invented.

1. Persist optional per-leg flight-search preferences separately from transport mode choices. Bind them to canonical endpoint identity/geography, validate pinned airport records, fail closed on stale/malformed data, preserve bookings and source segments.
2. Add airport-only search selection in the existing Transport detail. Keep suggested/selected labels distinct, require valid airport pairs, provide save/cancel/reset, explain access/onward scope. Suppress editing on booked/confirmed/imported or explicit saved airport-segment journeys.
3. Feed current preferences into existing one-way Omio route/date search; disable city-return pairing whenever either outer leg has a current override, preserving existing return controls otherwise. Never invent via/nonstop parameters.
4. Test persistence, changed geography, booking and return-search guards; typecheck, focused integration, UI/Storybook checks and independent review. No deployment.
