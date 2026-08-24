# Morrovia

Morrovia is a travel-planning product for independent travellers planning complex, multi-stop international trips.

## Positioning

**Complex trips, made simple.**

Morrovia helps travellers turn a messy set of destinations, dates, preferences and constraints into a realistic journey they can trust.

## Core customer

Optimise first for:

- Independent travellers planning complex, multi-stop international trips
- Couples / two travellers initially
- 2–6 destinations or stops
- Trips combining flights, trains, driving, hotels and activities
- Travellers who want something more adventurous than a package holiday

Duration is not a target-customer requirement. Morrovia should support exploratory
trips of roughly 1–12 weeks, from a week-long multi-city break to a multi-month
journey, without rejecting an otherwise viable trip for duration alone. The
likely 2–6 week complexity sweet spot is an internal research hypothesis to
validate, not a proven or public product claim.
- Trips complex enough that planning across many tabs, maps and booking sites becomes painful

The product can support broader travel use cases, but product decisions should prioritise this customer first.

## Product principles

- Complex trips should feel simple to understand and edit.
- Help users make confident travel decisions, not just generate itinerary text.
- Optimise for coherent routing, realistic durations and sensible sequencing.
- Explain recommendations when the reasoning matters.
- Preserve user control. AI should recommend and assist, not silently overwrite decisions.
- When one part of the trip changes, help the user understand and resolve downstream impacts.
- Planning should naturally progress toward booking.
- Monetisation should feel like completing the trip, not like advertising.
- Prefer contextual recommendations for accommodation, flights, activities, car hire, transport and connectivity.
- Reuse existing design-system and interaction patterns wherever possible.
- Avoid adding complexity unless it materially improves the core job.

## Product context references

For additional product context, consult only the source relevant to the current task:

- `docs/easyt-business-plan.md` for product strategy, target customer, prioritisation, beta scope and roadmap context.
- `docs/product/jtbd-analytics.md` for product-event semantics and privacy-safe measurement.
- `easyt-content-engine-plan.md` for route-content, source quality and deterministic planning boundaries.

Use these documents as context and decision-making input. Do **not** automatically implement every idea they contain; only build what the current task requires.

## First-principles product thinking

Use Jobs To Be Done to establish **what the user needs**, and first-principles thinking to determine **how Morrovia should solve it**.

When making product, UX or technical decisions:

1. Identify the assumption being made.
2. Break the problem down into the traveller's fundamental needs, constraints and desired outcome.
3. Question whether the assumed feature, workflow or industry pattern is actually necessary.
4. Check whether Morrovia already solves the underlying job another way.
5. Rebuild the solution from those fundamentals.
6. Prefer the simplest solution that completes the user's Job To Be Done.
7. Use AI to remove steps and complexity where possible rather than recreating traditional software workflows.

Do not add a feature merely because competitors or conventional travel products have it.

Instead of reasoning:

> "Travel planners normally have this feature, so Morrovia should have it."

Reason:

> "What job is this feature solving for the traveller?"
>
> "What information or decision does the traveller actually need?"
>
> "Does Morrovia already solve that job?"
>
> "What is the minimum interaction required?"
>
> "Can AI remove a step rather than adding another screen, control or workflow?"

First-principles thinking should support fast product decisions, not create unnecessary analysis. Use it most deliberately for important workflows, new features, architecture decisions and areas where conventional travel-product patterns are being copied.

## Product decision filter

Before adding or materially changing functionality, ask:

> Does this help an independent traveller turn a complex multi-stop idea into a trip they feel confident will work?

If not, it is probably not a Year-1 priority.

Then ask:

> Is this the simplest effective way to solve that job?

If not, simplify before building.

## Engineering guidance

Before making changes:

1. Inspect the existing implementation.
2. Understand the current behaviour before proposing a new pattern.
3. Reuse existing components, patterns and data models where possible.
4. Avoid unnecessary rewrites.
5. Preserve working functionality unless the task explicitly requires changing it.
6. Keep implementations responsive and production-ready.
7. Consider loading, empty, error and edge states.
8. Avoid speculative abstractions or infrastructure that the current product does not yet need.
9. Run the relevant lint, typecheck, tests or build checks before completing a task.
10. Summarise meaningful changes and call out unresolved risks or assumptions.

## Implementation context routing

Read only the context relevant to the current task. Do not load unrelated project documentation unnecessarily.

- **UI/UX changes:** inspect `app/journey/journey-design.css`, `app/journey/easyt-navigation.tsx`, `components/easyt/easyt-controls.tsx`, and the closest existing Journey surface before introducing a new pattern.
  - For current Morrovia UI work, treat `app/journey/journey-design.css`, the current Journey homepage, shared navigation and current live components as the visual source of truth.
  - Historical QA files such as `easyt-design-qa.md` may provide context but must not override the current Morrovia visual system.
  - Reuse existing components and tokens where they represent the current Morrovia system; inspect nearby live surfaces before visual decisions; do not reintroduce older EasyT/portfolio styling simply because it exists in legacy components.
- **Design-system routing:** before creating or styling UI, inspect the relevant Storybook examples in `components/**/*.stories.tsx`, the shared controls in `components/easyt/`, and the closest live Morrovia pattern. Reuse production components and `--morrovia-*` semantic tokens where appropriate; do not hard-code an equivalent visual value. Preserve established desktop and mobile behaviour, and visually verify new states against current Morrovia references. Do not create a shared primitive for one page: extend shared components only when semantics genuinely recur, and keep product-specific UI local when abstraction would make the system worse. Historical EasyT/portfolio styling must not override the current Morrovia system.
- **Trip model and persistence:** inspect `lib/easyt/trip.ts`, `lib/easyt/repository.ts`, and `db/migrations/`.
- **Builder and route logic:** inspect `app/journey/new/trip-builder.tsx`, `lib/easyt/planner.ts`, `lib/easyt/cascade.ts`, and relevant tests.
- **Map, trip health and repair behaviour:** inspect `app/journey/plan-next/`, `lib/easyt/review.ts`, `lib/easyt/trip-replan.ts`, and relevant map components/tests.
- **Auth, analytics and deployment-sensitive changes:** inspect `auth.config.ts`, `.env.example`, `docs/easyt-google-sign-in.md`, `docs/product/jtbd-analytics.md`, and `docs/easyt-accessibility-privacy-audit.md`.

## Product metrics

Major commercial and product metrics currently include:

- Monthly Active Planners (MAU)
- Planner to monetised booking conversion
- Average affiliate revenue per monetised trip
- Trips made bookable
- Affiliate click-through rate
- Booking completion where measurable

Current planning assumptions for business modelling:

- ~1,000 qualified MAU
- ~12% monetised-trip conversion
- ~£70 average affiliate revenue per monetised trip
- approximately £100k annualised revenue run-rate

Longer-term target:

- ~10,000 qualified MAU
- similar conversion and monetisation economics
- approximately £1m annualised revenue run-rate

Treat these as hypotheses to validate with real product data, not fixed truths.

## Product priority

The core sequence is:

1. Make complex trip planning genuinely useful.
2. Make route and duration recommendations trustworthy.
3. Make edits intelligent and connected.
4. Make the trip feel complete and bookable.
5. Instrument the funnel.
6. Improve conversion and monetisation.
7. Expand into broader travel use cases only after the initial wedge is working.
