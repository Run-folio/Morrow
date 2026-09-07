# Homepage route publication review

Prepared against staging baseline `a523c7558694af745844b1b7cd37a0ec89009762` on 2026-09-07. This is a review record, not an alternative route catalogue or a publication approval. The production homepage consumes only the existing public-route owner.

## Japan five-stop change

Requested sequence: **Tokyo → Kanazawa → Takayama → Kyoto → Osaka**. Current canonical `japan-slow` and its matching Builder seed remain Tokyo → Takayama → Kyoto. The change has not been published or substituted only on the homepage.

To author this change through the existing workflow, update `lib/easyt/route-catalog.ts` and the matching record in `lib/easyt/inspiration.ts` together. Resolve canonical place identities for Kanazawa and Osaka; review minimum/recommended nights and the duration range; replace both old connections with the four new adjacent connections, recording unverified services explicitly. Do not carry over the old three-stop timings as evidence for the five-stop sequence.

Kanazawa already has credited production imagery. Osaka still requires its production asset association and rights verification. Hero imagery now has an independently recorded generation source; it does not establish transport or pacing facts.

## Canonical release results

The deterministic `checkPublicRouteRelease` reports the following. Full machine-readable evidence is in `artifacts/immersive-homepage/route-release-status.json`. Existing legacy publication eligibility and the stricter editorial release check are separate owners; “currently public” does not mean the new release fields are complete.

### japan-slow

**Current sequence:** Tokyo → Takayama → Kyoto

**Currently public:** true. **Release result:** incomplete.

- recommended-nights: Every stop needs an explicit reviewed recommended-night value at or above its minimum.
- route-order-rationale: The route needs an explicit rationale for its published order.
- connection-evidence: Tokyo → Takayama cannot be a reviewed medium-confidence assumption without linked provenance.
- connection-evidence: Takayama → Kyoto cannot be a reviewed medium-confidence assumption without linked provenance.
- explicit-unknowns: The editor must explicitly record remaining unknowns, even when there are none.
- editorial-owner: The route needs an editorial owner.
- editorial-reviewer: The route needs an editorial reviewer.
- image-rights: The published hero needs matching rights status and, when not owned, attribution and a source link.

Existing source records to review (not newly verified by this report):

- [Japan Travel](https://www.japan.travel/en/) — Official destination and regional context
- [Japan Railways](https://www.japanrailpass-reservation.net/) — Rail planning reference

### balkans-overland

**Current sequence:** Dubrovnik → Kotor → Shkodër → Tirana

**Currently public:** false. **Release result:** incomplete.

- recommended-nights: Every stop needs an explicit reviewed recommended-night value at or above its minimum.
- route-order-rationale: The route needs an explicit rationale for its published order.
- connection-evidence: Dubrovnik → Kotor is marked needs-review without source evidence or an explicit unknown.
- connection-evidence: Kotor → Shkodër is marked needs-review without source evidence or an explicit unknown.
- connection-evidence: Shkodër → Tirana cannot be a reviewed medium-confidence assumption without linked provenance.
- explicit-unknowns: The editor must explicitly record remaining unknowns, even when there are none.
- editorial-owner: The route needs an editorial owner.
- editorial-reviewer: The route needs an editorial reviewer.
- image-rights: The published hero needs matching rights status and, when not owned, attribution and a source link.

Existing source records to review (not newly verified by this report):

- [Croatia Tourism](https://croatia.hr/en-gb) — Official destination context
- [Montenegro Travel](https://www.montenegro.travel/en) — Official destination context
- [Albania Tourism](https://albania.al/) — Official destination context

### vietnam-cambodia

**Current sequence:** Hanoi → Hoi An → Ho Chi Minh City → Siem Reap

**Currently public:** false. **Release result:** incomplete.

- recommended-nights: Every stop needs an explicit reviewed recommended-night value at or above its minimum.
- route-order-rationale: The route needs an explicit rationale for its published order.
- connection-evidence: Hanoi → Hoi An cannot be a reviewed medium-confidence assumption without linked provenance.
- connection-evidence: Hoi An → Ho Chi Minh City cannot be a reviewed medium-confidence assumption without linked provenance.
- connection-evidence: Ho Chi Minh City → Siem Reap is marked needs-review without source evidence or an explicit unknown.
- explicit-unknowns: The editor must explicitly record remaining unknowns, even when there are none.
- editorial-owner: The route needs an editorial owner.
- editorial-reviewer: The route needs an editorial reviewer.
- image-rights: The published hero needs matching rights status and, when not owned, attribution and a source link.

Existing source records to review (not newly verified by this report):

- [Vietnam Tourism](https://vietnam.travel/) — Official destination context
- [Visit Cambodia](https://www.tourismcambodia.com/) — Official tourism context
- [UNESCO Angkor](https://whc.unesco.org/en/list/668/) — Heritage context

### iceland-ring-road

**Current sequence:** Reykjavík → Vík → Mývatn → Akureyri

**Currently public:** false. **Release result:** incomplete.

- recommended-nights: Every stop needs an explicit reviewed recommended-night value at or above its minimum.
- route-order-rationale: The route needs an explicit rationale for its published order.
- connection-assumption: Reykjavík → Vík needs a reviewed connection assumption or an explicit unknown.
- connection-assumption: Vík → Mývatn needs a reviewed connection assumption or an explicit unknown.
- connection-assumption: Mývatn → Akureyri needs a reviewed connection assumption or an explicit unknown.
- explicit-unknowns: The editor must explicitly record remaining unknowns, even when there are none.
- editorial-owner: The route needs an editorial owner.
- editorial-reviewer: The route needs an editorial reviewer.
- image-rights: The published hero needs matching rights status and, when not owned, attribution and a source link.

Existing source records to review (not newly verified by this report):

- [Visit Iceland Ring Road](https://www.visiticeland.com/article/the-ring-road/) — Official Ring Road context

## Required editorial decisions

Assign the editorial owner and an independent reviewer, review the proposed sequence/pacing and connection evidence, then record the real review date and explicit unknowns. The homepage task must not manufacture those identities or upgrade `needs-review` confidence merely to render four examples. After those records are complete, run the existing release check, publication/handoff tests and the four-route browser matrix before deployment.
