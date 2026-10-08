# Batch14 beta planner simplification

Approved scope: Shaun's “yes please update all” after explicitly rejecting the general Review trip feature, requesting the top form's blue/lavender fill removed, removing optional transport/interest controls, and consolidating selected bases into the main destination editing area. Sole implementer/native execution; no additional implementer. Deployment remains c1ce2bba0abf12f4ebe8a6b479e3e9a0e3f7b910 until separately approved publication.

Remove general Review trip button/modal and retained-content card stack from normal Builder. Keep all retained authored data losslessly. Update route is optional deliberate optimisation: no-proposal/unavailable feedback is small inline by the action; genuine changed-order comparison remains deliberate and requires Apply order. Normal accepted edits autosave and reconcile only necessary dependents. Do not silently change authoritative order.

Remove optional transport and interest controls from Homepage capture, fresh/manual capture and mounted/legacy Builder preferences. Keep dates, travellers and budget. Do not clear stored preferences/instructions/bookings, rewrite routing, fabricate alternative transport or change the schema. Keep actual blocking/retry information at its relevant field/action, without a general review modal/global banner.

Show chosen bases with their parent intent within Places you want to visit, using canonical ordered stop IDs (e.g. South Korea · Busan, Seoul); use the existing parent Edit action to edit its bases. Remove the duplicate detached summary where canonical top controls are present. Preserve parent intent/stay IDs, repeat identities, authoritative order, requested/held nights and existing grouped removal safety.

Normalize typography by label, value, action and supporting-text roles across both Homepage Plan with stops/Describe and Builder, using existing body/control/fine-print tokens. Use white panels and neutral joined origin/destination boundaries, shared through planner composition styles; preserve shared semantic tokens, table/map, controls, responsive behavior and accessibility. Reuse EasyTButton, MorroviaDestinationField/Tag, date/quantity/budget controls, SaveStatus and the existing real route proposal comparison. No replacement general modal, new sidebar or new primitive.

Verify RED/GREEN mounted user flows, preservation and proposal/staleness guards; real local desktop/mobile pixels and overflow; UI audit/typecheck/build/Storybook as applicable. Independently review the exact new local candidate. No push/deploy/schema/config/credential change/reset/delete in this correction.

## Approved field-anatomy correction

Travel dates and Personalize use the same Personalize label treatment, secondary
value placement, icon baseline, spacing and state styles. Reuse one shared field
presentation across both homepage tabs and Builder dates. The shared presentation
composes the existing date picker and button; it does not change autosave,
accepted route edits or the deliberate Update route proposal boundary.

Acceptance: compare computed label/value/icon styles and relative baselines at
1440px and 390px in both homepage tabs; compare normal, hover, focus, expanded
and disabled styles. Compare Builder date content to the same shared anatomy.
Review readable side-by-side field pixels before user review. CSS-state fixtures
are distinct from mounted interaction tests. The separately discussed new
homepage arrangement remains held until both mockups are settled.

## Approved compact layout, actual pixels received

The three exact approved images were delivered as actual conversation attachments:
Plan with stops and Describe my trip (2048x704 displayed), Builder top (2048x736).
All pixels were inspected; earlier Library 403/text-only access history is superseded.

Homepage places the existing trip type at the right of the tabs, with their divider
ending before it. Plan retains joined origin/destinations; Describe uses the existing
prompt across the full width and hides only the origin presentation. Its canonical
origin, raw draft, destination occurrences, endpoint choice and prompt persist in the
same input snapshot across tabs/reload. An unresolved hidden origin reveals the
existing Stops editor and focuses it after render, with no handoff/capture/reservation.
Dates and Personalize keep the already approved common anatomy and responsive stack.

Builder keeps the table/map, moves trip type upper right, retains bounded origin and
joined destinations, and presents Date/Travellers/Budget with shared planner anatomy.
Native select and bounded quantity keyboard/change ownership remain in existing
components. Update route is the outlined shared secondary button and still optional.
Only genuine planning-area intents create headings over individual child occurrence
tags. Do not infer grouping from country geography. Child removal uses the current
stop safety/confirmation flow; parent edit and whole-parent removal remain accessible
beside its heading to preserve existing guarded operations. These functional affordances
are a deliberate small addition to the static reference, rather than hidden controls.

Keep current type/token roles and existing hero assets; do not reintroduce removed
interests/transport controls merely because ImageGen wrote them in placeholder copy.
No route schema, persistence engine, geography resolver, deployment or hosted data
change belongs to this layout commit. The separate geography plan remains gated.
