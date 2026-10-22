# Reviewed island destination relationships

This small projection supports the explicitly reviewed **Bali island → Ubud / Kuta → DPS** subset. It does not provide polygon coverage, approve the Bali province as an island, certify arbitrary nearby settlements, or choose an overnight base automatically. The canonical `bali` catalogue island remains unresolved until the traveller explicitly chooses a verified settlement.

## Evidence reviewed 21 October 2026

- [Indonesia Tourism — Ubud](https://www.indonesia.travel/gb/en/destination/bali-nusa-tenggara/bali/ubud): locates Ubud in central Bali island.
- [Indonesia Tourism — Bali](https://www.indonesia.travel/gb/en/destination/bali-nusa-tenggara/bali/bali): identifies Kuta among Bali destinations and Ngurah Rai as the flight gateway.
- [Indonesia Tourism — airport access](https://www.indonesia.travel/gb/en/destination/bali-nusa-tenggara/bali/denpasar---bali-ngurah-rai-airport): describes airport road access serving Ubud/Kuta. Its current fares, operators and advertised times are not imported or relied upon.

The exact Ubud GeoNames1622846, Bali Kuta1639002 and OurAirports26751 records are reused from the accepted reference snapshot699b595afdba9be6994e. Existing GeoNames/OurAirports attribution and licensing apply; see this directory's reference-source documentation. Another Kuta (GeoNames7378343) is a different settlement and receives no Bali membership or DPS mapping.

`reviewed-island-destinations.server.ts` compares base identity, active status, type, country, name, provider and point with the actual accepted reader. The gateway has an independent immutable provider/name anchor, and its projection is tested against that same reader. A reference snapshot update requires explicit relationship review; a stale or changed covered base never falls through to a live guess.

Automatic discovery and typed Ubud/Kuta selection consume the same reviewed tuples. Unlisted results for this covered parent remain unapproved by this narrow membership proof. Other islands keep their existing physical-verification path. New normalizer provenance says **Reviewed island membership**, never **Physical island verified**.

Transport receives DPS only for an exact, geographically accepted selected Ubud/Kuta tuple. It preserves the actual stop coordinates and composes separate airport/road segments using the existing planning calculation. Explicit airport choices, excluded modes, booked facts and custom knowledge-store overrides remain authoritative. This is planning access evidence, not a direct-flight, schedule, booking, ferry or current road-service guarantee. No unresolved island airport-only saved state was added.

No global ingestion, new live geocoder capture, saved-trip migration, automatic base selection or cleanup accompanies this projection.
