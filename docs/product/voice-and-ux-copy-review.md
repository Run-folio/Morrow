# Morrovia voice and contextual UX copy review

28 September 2026 · **PROPOSAL ONLY — founder review gate**

**Clear first. Warm second. Adventurous where it fits.** A well-travelled friend who helps you make a good plan without taking over.

## Source and status ledger

Starting SHA: `5828e862e0af595ade73932bcdb2e009634f74a2`.
Fresh branch: `codex/product-voice-copy-review`. Reference worktrees were read only; no product branches were merged or cherry-picked.

| Reference | Branch / exact committed source | Surfaces |
| --- | --- | --- |
| A | `codex/skim-first-ux-audit` · `5828e862e0af595ade73932bcdb2e009634f74a2` | Homepage, catalogue, public Route Detail, Discovery, accepted Builder, shared statuses, Stay, Transport, existing feedback; approved behavioural specs |
| I | `codex/itinerary-day-view-349` · `42a6986a487a39abae23c3086d0728c5463ac908` | Completed Itinerary and shared compact TripShell; source of truth for those surfaces |
| O | `codex/route-overview-cta` · `74956c2743dfc2fede54813765b7deefa668d6a8` | Overview CTA and consolidated warning presentation |
| T | `codex/trips-card-cleanup` · `eff90f0955b2bd9b3fbf1c9bb5062d92c1b73e48` | Trips library and empty state; accepted geometry |
| E | `codex/explore-category-simplification` · `d18a9c17384e794f13859ecabd623176f7261f83` | Current four-category Explore |

A/I/O/T/E below resolve to those commits, not to a guessed combined release. All listed branch heads were present. The audit branch has untracked mockup artifacts; the base commit itself is clean committed documentation/product history. Those artifacts were read in place, not committed or modified here.

**Evidence classes:** “Current” below means source-inspected, locally implemented at the named commit. The [historical audit](skim-first-ux-audit.md) is an index, not current #349 evidence. The [existing mockup review](/Users/shaun/.codex/worktrees/skim-first-ux-audit/Morrovia/docs/product/skim-first-mockup-review.md) contains non-production proposals. The [Explore spec](../superpowers/specs/2026-09-28-explore-empty-retry-design.md) and [feedback spec](../superpowers/specs/2026-09-28-contextual-one-time-feedback-design.md) are approved behavioural direction, not implemented behaviour. This document edits neither spec. Proposed Spanish on an English-only surface is a review translation, not an integrated locale.

## Highest-value decisions

1. Make Overview's heading **Your route** regardless of unresolved issues; keep its truthful state-dependent primary action.
2. Use **Where will you go first? / Plan a trip** for the first-trip invitation. Retain useful first-use help; do not redesign the library.
3. Replace internal “Builder” wording with the actual task; keep **Use this route**.
4. Carry **Couldn’t load ideas / Try again** into the separately approved Explore work. Do not ship a retry label without its scoped handler.
5. Keep device/account/pending save distinctions and transport uncertainty. Compress only redundant success prose.
6. Consider **How’s planning your trip going?** separately from visual feedback cleanup: it changes the survey’s question from general product sentiment to planning experience.

Founder decisions: approve REWRITE/REMOVE entries; approve or reject the survey measurement change (V20); approve the data-aware warning presentation dependency (V08). No changes to timing, eligibility, scale, account uniqueness or retry policy are proposed. Navigation vocabulary remains unchanged; “View journey” versus “Route” can be evaluated later as a distinct information-architecture question.

## Proposals by existing owner

Every entry includes the current English/Spanish, proposed pair, action inspection, protected meaning and reason. KEEP means no copy change. MISSING means no current Spanish value was found in that owner, even if the global product offers Spanish. Template expressions below use existing identifiers; any new required data is called out explicitly. Translations are proposals reviewed for meaning, not native-speaker or rendered-locale acceptance.

### V01 · Homepage · first visit

- **Source:** A · `app/journey/home/immersive/immersive-home.tsx`, `ImmersiveHome` hero.
- **Current English:** “Go further.” / “Make it yours.”; “Plan multi-stop trips with suggested routes, places to stay and things to do. Then make the plan your own.”
- **Proposed English:** KEEP heading; “Plan a trip with several stops, then shape the route, stays and activities around you.”
- **Current Spanish:** “Ve más lejos.” / “Hazlo tuyo.”; “Planifica viajes con varias paradas, rutas sugeridas, lugares donde alojarte y cosas que hacer. Después, haz tuyo el plan.”
- **Proposed Spanish:** KEEP heading; “Planifica un viaje con varias paradas y adapta la ruta, los alojamientos y las actividades a tu gusto.”
- **Decision:** REWRITE.
- **Actual action/destination (source inspection):** Hero prose has no action; existing anchor below links to #routes.
- **Meaning/variables to preserve:** Keep positioning and existing controls. Suggested options are not bookings.
- **Reason:** More direct support copy; personality stays in the editorial heading, without a new paragraph.

### V02 · Routes catalogue · search

- **Source:** A · `app/journey/discover/discovery-browser.tsx`, search Field and empty-result branch.
- **Current English:** Label “Search routes”; placeholder “A country, a place, a way to go…”; empty “No routes match just yet.” / “Try fewer filters, another country or a broader search.” / “Clear filters”
- **Proposed English:** KEEP label/action/help; empty heading “No routes match your search.”
- **Current Spanish:** MISSING
- **Proposed Spanish:** “Buscar rutas”; “Un país, un lugar, una forma de viajar…”; “Ninguna ruta coincide con tu búsqueda.” / “Prueba con menos filtros, otro país o una búsqueda más amplia.” / “Borrar filtros”
- **Decision:** REWRITE.
- **Actual action/destination (source inspection):** Field updates filters.search; Clear filters calls reset; Start your own trip links /journey/new.
- **Meaning/variables to preserve:** Visible/screen-reader label remains; zero filtered results differs from catalogue unavailable.
- **Reason:** Remove the implied promise in “just yet”; preserve useful recovery.

### V03 · Public Route Detail · editable handoff

- **Source:** A · `app/journey/routes/[slug]/route-detail-view.tsx`, heroActions/editable; `route-plan-link.tsx`, RoutePlanLink.
- **Current English:** “Use this route”; “Use this reviewed route as your starting point, then shape the dates and nights in Builder.”
- **Proposed English:** “Use this route”; “Start with this route, then adjust the dates and nights.”
- **Current Spanish:** MISSING
- **Proposed Spanish:** “Usar esta ruta”; “Empieza con esta ruta y ajusta las fechas y las noches.”
- **Decision:** REWRITE.
- **Actual action/destination (source inspection):** RoutePlanLink guards new-trip navigation then opens /journey/new?inspire=${encodeURIComponent(draft.routeKey)}.
- **Meaning/variables to preserve:** Editable route handoff, exact routeKey; no automatic booking or account-save claim. Keep source/review disclosures elsewhere.
- **Reason:** Retain legitimate first-use explanation without exposing an internal surface name. If the earlier skim-first removal is implemented, do not reinsert this sentence.

### V04 · Discovery · reviewed places with no fixed nights

- **Source:** A · `lib/easyt/i18n.ts`, builder.countryDiscovery.introSupported.
- **Current English:** “Start with these supported places and adjust the selection.”
- **Proposed English:** “Choose a few places to start with. You can adjust your selection.”
- **Current Spanish:** “Empieza con estos lugares verificados y ajusta la selección.”
- **Proposed Spanish:** “Elige algunos lugares para empezar. Puedes ajustar tu selección.”
- **Decision:** REWRITE.
- **Actual action/destination (source inspection):** This introductory text accompanies selection; existing Add/Remove remain.
- **Meaning/variables to preserve:** Do not relabel reviewed evidence as first-hand expertise. Source badges stay.
- **Reason:** “Supported” is implementation vocabulary; source provenance already owns the evidence claim.

### V05 · Discovery · shortlist actions

- **Source:** A · `lib/easyt/i18n.ts`, builder.visualDiscovery.actions and accessibility.
- **Current English:** “Add”; “Remove”; “Confirm places”; “Add to shortlist”; “Remove from shortlist”
- **Proposed English:** KEEP
- **Current Spanish:** “Añadir”; “Quitar”; “Confirmar lugares”; “Añadir a la selección”; “Quitar de la selección”
- **Proposed Spanish:** KEEP
- **Decision:** KEEP.
- **Actual action/destination (source inspection):** These are existing action labels; no action-label change proposed.
- **Meaning/variables to preserve:** Keep shortlist distinct from saved itinerary/booking and preserve longer accessible names.
- **Reason:** Literal labels convey the job; no adventure language.

### V06 · Builder · normal editing

- **Source:** A · `app/journey/new/trip-builder.tsx`, heading and device save label.
- **Current English:** “Shape the route.”; “Saved on this device”
- **Proposed English:** KEEP
- **Current Spanish:** “Dale forma a la ruta.”; “Guardado en este dispositivo”
- **Proposed Spanish:** KEEP
- **Decision:** KEEP.
- **Actual action/destination (source inspection):** Existing route editor and device save state; no navigation change.
- **Meaning/variables to preserve:** Device-only status is not account sync. Existing fields, night allocation, Save changes and Build trip remain.
- **Reason:** Accepted Builder already fits the voice; do not reopen its layout.

### V07 · Builder · unequal night allocation

- **Source:** A · `app/journey/new/trip-builder-route-workspace.tsx`, nightStatus.
- **Current English:** `${nightStatus.allocated} of ${nightStatus.total} allocated` beside the total-night heading
- **Proposed English:** “You’ve planned ${nightStatus.allocated} night(s), but your trip has ${nightStatus.total}.”
- **Current Spanish:** `${nightStatus.allocated} de ${nightStatus.total} asignadas`
- **Proposed Spanish:** “Has distribuido ${nightStatus.allocated} noche(s), pero tu viaje tiene ${nightStatus.total}.”
- **Decision:** REWRITE.
- **Actual action/destination (source inspection):** Informational status only; existing night steppers call onEditNights.
- **Meaning/variables to preserve:** Render night/nights and noche/noches by allocated count; total retains nights as unit. No conversion to days or change to locks/blocking. Example: 7 nights vs 6.
- **Reason:** Clarifies the mismatch; deliberately longer. Replace the mismatch line only, do not add another status row; 390/430 fit remains to be checked.

### V08 · Overview · end-date mismatch

- **Source:** O · `lib/easyt/trip-overview-issues.ts`, conciseFinding; `lib/easyt/review.ts`, trip-end-mismatch.
- **Current English:** `Final stop ends on ${tripEnd[1]}, not on trip end`
- **Proposed English:** “Your last stop ends on {lastStopDate}, but your trip ends on {tripEndDate}.”
- **Current Spanish:** MISSING
- **Proposed Spanish:** “Tu última parada termina el {lastStopDate}, pero tu viaje termina el {tripEndDate}.”
- **Decision:** NEEDS PRODUCT DECISION.
- **Actual action/destination (source inspection):** Existing Review timing/route action remains the issue’s href; this entry changes no destination.
- **Meaning/variables to preserve:** Current conciseFinding receives a message and extracts only one date. Proposed placeholders require both authoritative dates and existing locale formatting, not string guessing. Preserve year across year boundaries.
- **Reason:** Concrete comparison supports a decision. This needs a separately approved presentation interface/data dependency; illustrative 28 Aug vs 27 Aug is not a current fixture assertion.

### V09 · Overview · healthy or unresolved route

- **Source:** O · `components/easyt/trip-overview-workspace.tsx`, routeIntro and primaryAction.
- **Current English:** Eyebrow “Your route”; heading “Your route is ready to shape”; support “Here’s your trip at a glance. Review the route, check the timing and start planning your days.”
- **Proposed English:** Heading “Your route”; remove duplicate eyebrow and support. Keep primary action chosen by current state.
- **Current Spanish:** MISSING
- **Proposed Spanish:** Heading “Tu ruta”; state labels “Revisar ruta” / “Planificar mis días” / “Revisar itinerario” / “Seguir planificando”
- **Decision:** REWRITE.
- **Actual action/destination (source inspection):** Critical issue: its exact href. Otherwise /journey/${encodeURIComponent(trip.id)}/itinerary. Existing Plan my days / Review itinerary / Continue planning conditions stay.
- **Meaning/variables to preserve:** Do not imply readiness, weaken warnings or change card dimensions. Removing duplicate text must not leave an empty wrapper.
- **Reason:** Neutral heading is truthful across states. This is the approved voice direction, not another route-action redesign.

### V10 · Itinerary · empty activity plan, including logistics-only

- **Source:** I · `components/easyt/rich-itinerary-day-planner.tsx`, !hasVisibleActivities branch.
- **Current English:** “Plan your day in ${composition.context.destination}”; “Add activities or explore suggestions when you are ready.”; “Add activity”; “See suggestions”
- **Proposed English:** KEEP
- **Current Spanish:** “Planifica tu día en ${composition.context.destination}”; “Añade actividades o explora sugerencias cuando quieras.”; “Añadir actividad”; “Ver sugerencias”
- **Proposed Spanish:** KEEP
- **Decision:** KEEP.
- **Actual action/destination (source inspection):** Add activity calls onAddOpen(null); suggestions uses onSeeSuggestions or existing ideasHref fallback. Workspace remains mutation/day owner.
- **Meaning/variables to preserve:** No invented times/weather. Actual stay/transport context precedes activity invitation. Daypart system stays.
- **Reason:** Warmth is useful here, and #349 already supplies it.

### V11 · Itinerary · populated day

- **Source:** I · `components/easyt/rich-itinerary-day-planner.tsx`, populatedActions/occupiedParts.
- **Current English:** “Add activity”; existing saved activities and occupied dayparts
- **Proposed English:** KEEP
- **Current Spanish:** “Añadir actividad”; existing saved activities and occupied dayparts
- **Proposed Spanish:** KEEP
- **Decision:** KEEP.
- **Actual action/destination (source inspection):** onAddOpen(null) opens the existing selected-day composer.
- **Meaning/variables to preserve:** Preserve add/edit/move/remove/drag/keyboard/undo and persistence; no new onboarding or display rules.
- **Reason:** Let the traveller’s plan lead; do not add a success sentence after each edit.

### V12 · My Trips · first trip

- **Source:** T · `app/journey/dashboard/dashboard-client.tsx`, emptyHero.
- **Current English:** “Start with a trip you’ve been thinking about.”; “Describe the places, time and travel style. Morrovia will help shape the route.”; “Plan a new trip”
- **Proposed English:** “Where will you go first?”; “Tell us the places, dates and travel style you have in mind.”; “Plan a trip”
- **Current Spanish:** “Empieza con un viaje que ya tienes en mente.”; “Describe los lugares, el tiempo y el estilo de viaje.”; “Planificar un viaje nuevo”
- **Proposed Spanish:** “¿Adónde quieres ir primero?”; “Cuéntanos qué lugares, fechas y estilo de viaje tienes en mente.”; “Planificar un viaje”
- **Decision:** REWRITE.
- **Actual action/destination (source inspection):** Existing primary href /#start-building opens homepage trip prompt.
- **Meaning/variables to preserve:** No date requirement newly imposed; uncertainty still allowed by existing capture. Do not apply this invitation to populated collection.
- **Reason:** Specific invitation and a literal action. Retain one useful first-use sentence, without adding a second campaign.

### V13 · My Trips · populated library

- **Source:** T · `app/journey/dashboard/dashboard-client.tsx`, trip-library-title and card primaryLabel.
- **Current English:** “Your trips”; “Plan your days”
- **Proposed English:** KEEP
- **Current Spanish:** “Tus viajes”; “Planificar los días”
- **Proposed Spanish:** KEEP
- **Decision:** KEEP.
- **Actual action/destination (source inspection):** Card primaryHref remains lifecycle-derived; only the ordinary planning label is quoted here.
- **Meaning/variables to preserve:** Current/Upcoming/Ideas/Past hierarchy and accepted grid stay. Do not force this label onto Ideas or archived cards.
- **Reason:** Good labels already exist; no global navigation rename.

### V14 · Explore · no usable results after failure

- **Source:** E · `components/easyt/trip-explore-workspace.tsx`, unavailable; approved A Explore spec, States and actions.
- **Current English:** “We couldn’t load ideas right now”; “Try another category or come back shortly. Your trip and saved ideas are unchanged.” No retry action in this implementation.
- **Proposed English:** “Couldn’t load ideas”; “Try again” — approved, NOT IMPLEMENTED
- **Current Spanish:** MISSING
- **Proposed Spanish:** “No se pudieron cargar las ideas”; “Reintentar”
- **Decision:** REWRITE.
- **Actual action/destination (source inspection):** Current branch has no retry handler. Separate approved implementation must retry exact destination ID/category, single-flight and stale-safe.
- **Meaning/variables to preserve:** No 0 ideas on failure, no scope switch, no promised results, no new provider.
- **Reason:** Use the accepted compact failure treatment; copy alone cannot satisfy the behaviour.

### V15 · Explore · genuine empty / partial failure

- **Source:** E · same owner, empty branch; A approved Explore spec.
- **Current English:** “No ${exploreCategoryLabels[category].toLocaleLowerCase()} ideas found”; “Try For you or another category for ${destinationLabel}.”
- **Proposed English:** Confirmed empty: “No ideas found” / “Try For you” where applicable. Partial failure: retain valid current-scope result copy, no whole-panel failure.
- **Current Spanish:** MISSING
- **Proposed Spanish:** “No se encontraron ideas” / “Probar Para ti” where applicable
- **Decision:** REWRITE.
- **Actual action/destination (source inspection):** Approved future Try For you retains exact destination. Named Explore ${destinationLabel} must select that exact canonical stop only after click; no invented alternative.
- **Meaning/variables to preserve:** Four categories stay For you / Must-see / Food / Tours. Spanish action requires the eventual category translation to match; no category translation rollout here. All relevant searches must succeed before empty.
- **Reason:** Avoid repeated scope text. Display conditions belong exclusively to the existing separate spec; no behaviour approved by this copy document.

### V16 · Stay · source failure

- **Source:** A · `components/easyt/trip-stay-workspace.tsx`, finder.status failed.
- **Current English:** “Stay options are unavailable”; “No mapped or live options could be loaded. Your trip and selected stop are unchanged.”; “Try stay search again”
- **Proposed English:** “Couldn’t load stays”; “Try again” (remove repeated detail where the selected destination is visible)
- **Current Spanish:** MISSING
- **Proposed Spanish:** “No se pudieron cargar los alojamientos”; “Reintentar”
- **Decision:** REWRITE.
- **Actual action/destination (source inspection):** Existing onRetry={finder.retry}; retry selected finder context, not a booking action.
- **Meaning/variables to preserve:** Retain any separate save/recovery alert; Chosen is not Booked; Availability to check remains. No provider/affiliate disclosure edits.
- **Reason:** Remove internal “mapped or live” explanation. Do not change legitimate empty to failure.

### V17 · Transport · plan overview and estimate

- **Source:** A · `components/easyt/trip-transport-workspace.tsx`, copyFor, TransportCard/SelectedJourneyDetail.
- **Current English:** “Your transport, in journey order”; “How you are getting between each place, and what still needs attention.”; “Planning estimate; check live schedules before booking.”; “View details”
- **Proposed English:** Heading “Your transport”; KEEP estimate and View details; remove introductory sentence where ordered legs already provide the context.
- **Current Spanish:** “Tus traslados, en orden”; “Cómo te mueves entre cada lugar y qué necesita atención.”; “Estimación de planificación; comprueba horarios antes de reservar.”; “Ver detalles”
- **Proposed Spanish:** “Tus traslados”; KEEP estimate and Ver detalles; remove introduction in the same state.
- **Decision:** REWRITE.
- **Actual action/destination (source inspection):** View details calls selectJourney(item.leg.id), preserving exact leg and selected detail; no transport-navigation changes.
- **Meaning/variables to preserve:** Booking status and schedule/duration certainty remain separate. Keep warning/provenance and timeUnknown, with correct current leg.
- **Reason:** Compress orientation, not uncertainty. A booked transfer can still have an estimated time.

### V18 · Shared rename dialog · optional title

- **Source:** I · `components/easyt/trip-shell-client.tsx`, rename dialog/saveRename (A matches quoted text).
- **Current English:** “Rename this trip”; “Give the trip a personal name, or leave it blank to use Morrovia’s geographic title. Your route and dates will not change.”; “Trip name”; “Save name”
- **Proposed English:** KEEP heading/field/action; detail “Leave blank to use the destination-based name.”
- **Current Spanish:** MISSING
- **Proposed Spanish:** “Cambiar el nombre del viaje”; “Déjalo en blanco para usar el nombre basado en los destinos.”; “Nombre del viaje”; “Guardar nombre”
- **Decision:** REWRITE.
- **Actual action/destination (source inspection):** saveRename normalizes whitespace, enforces 80 Unicode characters and calls renameTripIdentity through existing mutation owner.
- **Meaning/variables to preserve:** Keep count/80, optional field, Cancel, validation and title fallback. No route/date mutation or persistence changes.
- **Reason:** Retains the only non-obvious instruction; do not replace field label with a placeholder.

### V19 · Shared saving · device / pending / account / recovery

- **Source:** A · `components/easyt/morrovia-feedback.tsx`, saveLabels; `trip-shell-resolver.tsx`, syncComplete; I compact shell is authoritative for mobile.
- **Current English:** “Saving to your account…”; “Saved to your account”; “Couldn’t save to your account”; success banner “Trip saved to your account” / “You can continue this same trip on another device.”
- **Proposed English:** KEEP pending/error/status labels. For confirmed success banner: “Saved to your account”; remove supporting sentence. Device wording remains “Saved on this device” in accepted compact surfaces.
- **Current Spanish:** MISSING for shared saveLabels/banner; localized Builder device value is recorded in V06. Builder also already supplies “Guardado en tu cuenta”; do not overwrite that owner with a second translation.
- **Proposed Spanish:** “Guardando en tu cuenta…”; “Guardado en tu cuenta”; “No se pudo guardar en tu cuenta”; device “Guardado en este dispositivo”
- **Decision:** REWRITE.
- **Actual action/destination (source inspection):** No new action. Success banner is gated by syncComplete; existing recovery/actions remain owned by resolver and persistence.
- **Meaning/variables to preserve:** No inferred save success from optimism; no account claim for device save. Do not remove two-copy recovery instructions or introduce dismissal timers.
- **Reason:** The destination is the useful confirmation. Existing shorter status is KEEP; avoid a duplicate shared policy.

### V20 · Feedback · deliberate open

- **Source:** A · `components/easyt/easyt-feedback.tsx`, copy.title/rate; approved feedback spec.
- **Current English:** “How’s Morrovia feeling?”; rating group “Rate Morrovia from 1 to 5”; “Send feedback”
- **Proposed English:** “How’s planning your trip going?”; group “Rate your trip-planning experience from 1 to 5”; KEEP Send feedback.
- **Current Spanish:** “¿Cómo se siente Morrovia?”; “Valora Morrovia del 1 al 5”; “Enviar comentarios”
- **Proposed Spanish:** “¿Cómo va la planificación de tu viaje?”; “Valora tu experiencia al planificar el viaje del 1 al 5”; KEEP Enviar comentarios.
- **Decision:** NEEDS PRODUCT DECISION.
- **Actual action/destination (source inspection):** Current send posts rating/comment to /api/easyt/feedback. Contextual invitation/account contract is approved but not implemented here.
- **Meaning/variables to preserve:** Keep five choices, numeric meaning and selected state. Current individual rating labels are English-only even in Spanish mode (MISSING localized choice labels); proposed spoken choice ${index + 1} out of 5 / ${index + 1} de 5. Do not reinterpret historical responses as the new question.
- **Reason:** Preferred founder voice narrows measurement from general sentiment to planning experience. Approve survey wording/measurement together without changing scale or eligibility.

### V21 · Feedback · invitation / failure / success

- **Source:** A · same owner copy.aria/error/thanks; approved feedback spec Invitation and form states.
- **Current English:** Invitation accessible name “Share feedback”; failure “Saved privately on this device. Try again later.”; success “Thank you.” / “Your feedback helps shape Morrovia.”
- **Proposed English:** Invitation “Share feedback”; expanded form has no invitation label/action. Failure “Couldn’t send feedback. Try again.” / “Try again”; success “Thank you.”
- **Current Spanish:** “Compartir comentarios”; “Guardado en este dispositivo; inténtalo de nuevo más tarde.”; “Gracias.” / “Tus comentarios ayudan a mejorar Morrovia.”
- **Proposed Spanish:** “Compartir comentarios”; expanded form has no invitation. “No se pudieron enviar los comentarios. Inténtalo de nuevo.” / “Reintentar”; “Gracias.”
- **Decision:** REWRITE.
- **Actual action/destination (source inspection):** Future scoped retry must use existing feedback/account owners under the approved spec. Current retry/draft handling is not proof of that behaviour.
- **Meaning/variables to preserve:** Retain note/rating, dismiss, accessible form label and sending state. For uncertain outcome do not claim definite rejection; use “We couldn’t confirm your feedback was sent.” / “No pudimos confirmar el envío de tus comentarios.” Retry same identity.
- **Reason:** Remove unsupported device/privacy assurance. No new timing, suppression or persistence conditions. Keep invitation accessible naming distinct from repeated visible invitation inside form.

### V22 · Map · delayed loading

- **Source:** A · `components/easyt/morrovia-loading-states.tsx`, map state long.
- **Current English:** “The map is taking longer than usual”; “Your route is safe. You can keep reviewing the trip while the map catches up.”
- **Proposed English:** KEEP title; “You can keep reviewing your route while the map loads.”
- **Current Spanish:** MISSING
- **Proposed Spanish:** “El mapa está tardando más de lo habitual”; “Puedes seguir revisando tu ruta mientras se carga el mapa.”
- **Decision:** REWRITE.
- **Actual action/destination (source inspection):** Informational state only; preserve existing error/retry action separately.
- **Meaning/variables to preserve:** This does not confirm persistence, map availability or travel feasibility. Keep route available under the existing caller contract.
- **Reason:** Remove blanket safety reassurance while retaining a useful alternative task.

## Context examples and protected decisions

- Empty activity plan: V10 invitation and Add activity are useful. Populated day: V11 saved itinerary leads; no new guidance or congratulations. Logistics-only is not “nothing planned.”
- Discovery: invite choice without inventing destination knowledge. Existing Route Detail’s “Connections to confirm” and “Confirm current schedules, changes and reservations for your dates.” are **KEEP** (`route-detail-view.tsx`, A). Editorial example using those supported facts: “Follow this route at your own pace; check the connections for your dates.” This is illustrative, not a replacement of every route description.
- Unequal allocation: V07 uses real nights; 7/6 is illustrative. End dates: V08 needs both real values; no fake date formatting or duration conversion.
- Account save: V19 only after acknowledgement. Device-only, pending, conflict and failed save are different states; existing serious recovery and destructive-confirmation details are **KEEP**, outside rewrite scope.
- Stay/Transport: selected/chosen, booked, estimated and unknown are not interchangeable. Provider attribution, photo/map credits, affiliate disclosure, legal/privacy copy and authentication boundaries are **KEEP**, outside this copy pass.
- Global navigation: existing Overview, Itinerary, Explore, Stay, Transport remain unchanged. “View journey” is retained pending any separate vocabulary decision; no global rename.

## Visual context and limitations

Reuse these existing local review specimens, with their original source/status labels. They are **reference context**, not new after screenshots or current production acceptance:

| Interaction | Existing visual reference | Copy review |
| --- | --- | --- |
| First trip | [390px historical/current specimen](/Users/shaun/.codex/worktrees/skim-first-ux-audit/Morrovia/docs/product/skim-first-mockups/screens/empty-trips-current-390.png) | V12 gives the complete heading/support/action pair |
| Route warning | [accepted source Overview specimen](/Users/shaun/.codex/worktrees/skim-first-ux-audit/Morrovia/docs/product/skim-first-mockups/screens/overview-review-current-390.png) | V08/V09; never use the older pre-consolidation founder screenshot as current |
| Empty Itinerary | [completed #349 evidence directory](/Users/shaun/.codex/worktrees/itinerary-day-view-349/Morrovia/docs/product) | V10 is KEEP; no new screenshot claimed |
| Explore failure | [approved static failure specimen](/Users/shaun/.codex/worktrees/skim-first-ux-audit/Morrovia/docs/product/skim-first-mockups/revisions/provider-failure-proposed-390.png) | V14; approved future retry, not implemented |
| Transport estimate | [existing 390px specimen](/Users/shaun/.codex/worktrees/skim-first-ux-audit/Morrovia/docs/product/skim-first-mockups/screens/transport-current-390.png) | V17 keeps uncertainty visible |
| Confirmed account save | [existing 390px status specimen](/Users/shaun/.codex/worktrees/skim-first-ux-audit/Morrovia/docs/product/skim-first-mockups/screens/account-success-current-390.png) | V19 is fixture-based, not an actual account write |

No new visual design or production components are proposed. Existing owners retained: ImmersiveHome, DiscoveryBrowser/RoutePlanLink, TripBuilderRouteWorkspace, TripOverviewWorkspace, RichItineraryDayPlanner, Dashboard, TripExploreWorkspace, TripStayWorkspace, TripTransportWorkspace, TripShell rename/resolver, MorroviaSaveStatus/MorroviaSectionStatus and EasyTFeedback. No shared API or Storybook change is made.

No full review board regenerated. No production bundles/components edited for a preview. No new matched copy screenshots were produced: existing artifacts do not contain the new bilingual proposals or a unified latest release. Therefore **390/430px Spanish expansion, long names and text zoom remain unverified visually**, especially V07 and V08. Proposed wording is not claimed to fit by character count. Future copy implementation must use existing layouts, preserve 44px targets/type sizes, wrap important meaning and test 1/2 nights, cross-year dates and long destination names. Source inspection of actions is not browser navigation testing. No retry/save/booking/survey acceptance is claimed.

## Self-review and recommended small batches

Reviewed each entry for action meaning, state, unnecessary warmth, loss of qualification, duplicate skim-first prose, terminology and bilingual equivalence. Current Spanish missing from source is labelled MISSING; proposed Spanish is never called implemented. Existing literal actions and good first-use copy are KEEP. No unrelated skim-first recommendation becomes an implementation ticket.

1. **Overview / route warning owners:** V09 first; V08 only after its presentation/data decision. Keep consolidated warning structure and canonical issue destinations.
2. **Public entry / library owners:** V01–V04 and V12, with V02/V03 English-only locale gaps recorded. Do not reinsert text already removed in a later accepted implementation.
3. **Shared small-copy owners:** V18/V19/V22; keep error/recovery and accessibility tests intact. No timers or new status model.
4. **Workspace owners:** V07/V16/V17 after responsive copy acceptance; no Builder redesign or transport identity changes.
5. **Existing approved behavioural tracks:** supply V14–V15 to Explore and V20–V21 to feedback after founder wording/measurement review. Do not implement their behaviour from this branch.

Checks: 22/22 proposal records have all nine required fields; all review-document links resolve locally. Documentation headings/links and reference file presence; source branch/commit verification; complete proposal field inventory; bilingual and dynamic-value self-review; `git diff --check`; documentation-only diff scope. No application build, CI, provider call, production save or browser functional test was run for this documentation task.

**MORROVIA VOICE + UX COPY: READY FOR FOUNDER REVIEW**

Stop here. Production strings and behaviour remain unchanged. Local only; no push, deployment, CI, staging or main changes.
