# Route Detail implementation — pre-change parity inventory

Starting branch: `staging`. Starting SHA: `9cbd4ea137914948d769dda6fb5cb005b48de8d1`. Working tree clean before this task. Homepage/footer/four-route publication baseline is merged. Routes catalogue exploration in another worktree is not part of this change.

Approved visual source: `/Users/shaun/.codex/visualizations/2026/09/07/01a07d5b-63e4-7980-9471-3985ecbcde71/morrovia-route-detail/prototype/src/App.jsx` and `styles.css`, with adjacent `review.md` and screenshot evidence. Read directly on 8 September 2026. The user's implementation request approves this direction. No newer reviewed Route Detail version is known in this task.

Production behavior stays authoritative. Since the prototype, the canonical Japan route now has five stops, Balkans/Vietnam/Iceland are published, night recommendations/order reasoning/ownership exist, and 18 licensed destination photographs are available. The implementation consumes these owners instead of the prototype's old snapshots, invented short role headings or image bundle.

| Existing content/behavior | Production owner | Implementation destination |
|---|---|---|
| Slug, permanent redirect, eligibility, admin hiding, SEO | page.tsx, public-route.ts, public-route-seo.ts | Unchanged access boundary |
| Title, summary, countries, stop count, example duration/rhythm/character | PublicRouteDetail | Immersive opening and introduction |
| Order, stop role, country, day labels and allocation | PublicRouteDetail.stops | Photo chapters, pacing disclosure and map list |
| Minimum/recommended nights and night rationale | RouteFamily.stops | Separately labelled ledger; never inferred from allocation |
| Transfer mode, duration, confidence and note | PublicRouteConnection | Between-stop controls and selected map context |
| Geographic preview, start/end, sequence disclaimer, worker/provider error boundary | RouteLiveMap | Extend same owner for selection; keep lazy import and accessible list |
| Route reasons, warnings, best time/conditions, all season/country context | PublicRouteDetail | Compact rationale and practical disclosures; no truncation |
| New reviewed order rationale, ownership and explicit unknowns | RouteFamily.release | Practical rationale/provenance disclosure |
| Attractions and place names | PublicRouteDetail.attractions | Lighter moments strip; old live photo lookup intentionally replaced by attributed canonical photos where available |
| Review date, confidence, source links and coverage | PublicRouteDetail.sources | Restrained status and sources disclosure |
| Hero/stop photography and credit links | route-images.ts, destination-inventory.json | Responsive licensed images via existing ResilientImage; no unlicensed legacy/prototype photographs |
| Start, draft serialization, endpoint semantics, route_started | RoutePlanLink / routePlannerPayload | Same owner at opening, pacing, map and closing; existing hero/final placement vocabulary |
| Page views / scroll depth | components/analytics.tsx | Unchanged; no extra hydration/view event |
| Affiliate action, provider fallback and disclosure | MorroviaAffiliateLink / getCurrentPartnerAction | Preserved verbatim behavior and placement |
| Navigation, account/language controls, mobile dock and footer | EasyTNavigation / MorroviaFooter | Reuse shared owners; match homepage overlay composition |
| Related journeys | Existing public eligibility | Two eligible alternatives, respecting admin-hidden keys, plus catalogue link |

Intentional changes: editorial layout replaces repetitive cards; allocation moves into disclosure; actual night guidance becomes visible; unknown timing stays unknown even if a likely mode is present. Unsupported legacy imagery becomes a branded text surface rather than being relabelled or fetched silently. Mobile places pacing before destination chapters, as requested. No route model, engine, Builder, auth, persistence, affiliate or analytics schema change is planned.

Shared components reused: EasyTButton, EasyTLinkButton, MorroviaStatusBanner, ResilientImage, RoutePlanLink, MorroviaAffiliateLink, EasyTNavigation, MorroviaFooter. Page-specific compositions: photo chapters, night ledger, map context/list, closing. No new global primitive.
