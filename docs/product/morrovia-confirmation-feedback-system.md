# Morrovia confirmation, success and recovery feedback

Status: Storybook design exploration only. No production consumer has been migrated.

## Product rule

The result of an important action should be obvious, but Morrovia should not reward every click with noise.

Choose the lightest feedback that answers the traveller's actual question:

| Consequence and visibility | Pattern | Rule |
| --- | --- | --- |
| Changed object is already obvious | Visible inline result | Change the object itself. Do not add a notification. |
| Background persistence | Quiet save status | Say whether the account or only this device has the change. |
| Important result could be missed | One brief notice | Name the result and keep any useful action available. Do not stack notices. |
| Meaningful failure or conflict | Persistent recovery | Say what failed, what is safe and what the traveller can do next. |
| Difficult-to-reverse loss | Consequential confirmation dialog | Name the item and explain concrete downstream loss. |

## Current feedback audit

Fresh audit evidence from this exploration is in `artifacts/confirmation-feedback-system/current-run/`.

| Surface | Current behaviour | What works | Inconsistency or risk |
| --- | --- | --- | --- |
| Builder | Autosave writes device recovery first, then may acknowledge the canonical account save. Footer states include saving, local, cloud and error. | The data model correctly separates device safety from account persistence. | Equivalent states use `Saved`, `Saved on this device`, `Saved to your account` and `Not synced` in different placements. The short `Saved` label is ambiguous. |
| Trip shell | Session and unsynced-device states persist above the workspace with recovery actions. | It does not silently merge device edits with the account copy. | Several simultaneous full-width notices can push the traveller's actual task down the page. Device discard still uses a native confirmation. |
| Map | Direct manipulation is visible and a temporary undo message supports reversal. Account save failures persist near the map. | The changed route is usually sufficient success feedback. | The undo treatment, save state and recovery error look unrelated. Some “saved” language follows a device write, not an acknowledged account save. |
| Nights | Allocation changes inline and Builder also exposes persistence state. | The new value is an obvious result. | A `Nights saved` toast would be redundant. Only persistence context adds useful information. |
| Prep | Task status, overall progress and the next-task panel update from saved trip facts. | Completion is grounded in canonical trip data. | At 100%, task state, progress and an additional completion message can repeat the same success. |
| Dashboard | Archive, restore and duplicate refresh the list. Delete uses `window.confirm`. | Reversible actions do not require a dialog. | A duplicated or restored trip may move after resorting and become hard to spot. Native deletion does not explain recovery or loss. |
| Recovery/conflict | Builder, Dashboard, Trip shell and Map preserve device copies and expose separate cloud/device choices. | Morrovia is already conservative about overwriting work. | Error components, titles, action ordering and terminology vary by surface. |
| Accommodation | `Needs a stay` and `Stay sorted` derive from saved booking facts. Provider links only record outbound analytics. | An affiliate click does not currently manufacture a booking fact. | Future confirmation work could accidentally turn “provider opened” into “booked” or “sorted”. |
| Profile, Passport and Stamps | Busy buttons, inline outcomes, rollback and focus management are used locally. | Important task outcomes stay contextual. | Similar account-backed failures use different visual treatments and copy length. |

The fresh screenshots also show that the shell can present a session warning and a device-recovery warning together. Both are truthful, but the combined visual weight competes with Prep and Map. That is a production prioritisation issue, not changed by this prototype.

## Proposed primitives

### `MorroviaSaveStatus`

Use in Builder, Map and editable trip action bars.

- `No changes to save`
- `Changes saved on this device`
- `Saving to your account…`
- `Saved to your account`
- `Couldn't save to your account`

`Saved to your account` may appear only after the current canonical write is acknowledged. A recovery write may say that changes are safe on this device, but it must never claim account persistence.

The status remains until the next meaningful state change or navigation. It does not vanish on a timer.

### `MorroviaBriefNotice`

Use for an important result that can otherwise be missed, such as a duplicated trip moving within a sorted list.

- One notice, never a stack.
- Specific title, never `Success`.
- A notice with a useful action remains until dismissed or navigation makes it irrelevant.
- A harmless no-action notice may leave after six seconds.
- Hover and focus pause an auto-dismiss timer.
- Failure, data safety and conflicts never use this pattern.

### `MorroviaRecoveryFeedback`

Use next to the affected route, editor or trip.

- State what failed.
- State whether the account copy, device edit or both remain safe.
- Offer one direct retry, or explicit copy choices for a conflict.
- Remain until success, an intentional recovery choice or a relevant state change.
- Do not steal focus merely because it appeared.

### `MorroviaConfirmationDialog`

Use only for deletion, discarding protected recovery work or removing a stop with meaningful downstream work.

- Native `dialog` semantics.
- Title names the object and action.
- Consequences are concrete.
- Initial focus lands on the safe action.
- Escape cancels.
- Closing restores focus to the opener.
- Mobile actions stack safe first, destructive last.

Do not use this dialog for normal night changes, Prep completion, ordinary Map edits, archive/restore or other safely reversible actions.

## Prototype scenarios and exact copy

### Trip save

The interactive flow is: stable account copy → device change → account save → account failure → retry → acknowledged account save.

- `Saved to your account`
- `Changes saved on this device`
- `Saving to your account…`
- `Couldn't save your changes`
- `The account copy was not updated.`
- `Your edits are still safe on this device.`
- `Try again`
- `Trying account save again…`
- `Saved to your account`

### Nights changed

- Visible value, for example `4 nights` → `5 nights`.
- Persistence: `Changes saved on this device`.
- No toast and no `Nights saved` message.

### Prep task completed

- Task: `Save offline maps`.
- State: `To do` → `Complete`.
- Progress: `3 of 8 tasks complete` → `4 of 8 tasks complete`.
- Reversible action: `Mark as not done`.
- No toast, large success card or second completion message.

### Trip duplicated and restored

- `Trip duplicated`
- `“Japan in spring copy” is ready.`
- Useful action: `View copy`

The action-bearing duplicate notice persists. A separate harmless `Trip restored` example demonstrates optional six-second auto-dismiss and pause on hover/focus.

### Route recovery

- `Couldn't update this route`
- `The new stop order did not reach your account.`
- `Your previous account route and this device edit are both safe.`
- `Try route update again`

### Cloud conflict

- `This trip changed on another device`
- `The account copy and this device copy now differ.`
- `Both copies are safe. Open one to compare before deciding what to keep.`
- `Open account copy`
- `Open device copy`

The prototype never presents `Replace` as the first action and never silently chooses a winner.

### Stop removal

- `Remove Matsumoto and its plan?`
- `This stop has downstream work that cannot be restored after the trip is saved.`
- `3 nights and 3 itinerary days will be removed.`
- `Tokyo to Kyoto will become one direct route leg.`
- `Saved stays and notes in Matsumoto will be removed.`
- Safe action: `Keep stop`
- Destructive action: `Remove Matsumoto`

### Accommodation and Trip.com

- Current state: `Needs a stay`
- Action: `Open Trip.com`
- Result: `Trip.com opened. This stop still needs a stay.`
- Disclosure: `Partner link · Morrovia may earn a commission at no extra cost to you.`

This exploration deliberately does not invent a traveller-confirmed booking workflow. `Stay sorted` still requires an explicit existing Morrovia save action or a canonical confirmed-booking fact.

## Affiliate and booking safeguards

An outbound click to Trip.com, Omio, Viator, Saily or another provider may communicate only that the provider opened. It must not announce or set:

- booked
- paid
- stay sorted
- transport booked
- Prep task complete
- trip complete

Affiliate analytics and product-readiness facts remain separate.

## Accessibility and motion

- Polite atomic statuses announce save and harmless confirmation changes.
- Persistent failures use alert semantics.
- Icons are decorative when adjacent text carries the meaning.
- Text, not colour, names every state.
- Existing Morrovia focus rings and button targets are reused.
- The dialog opens on the safe action, supports Escape and restores focus.
- Saving-icon rotation stops under `prefers-reduced-motion`; state copy remains visible.
- Auto-dismiss pauses on hover and keyboard focus.

Representative Storybook axe checks are recorded during visual QA. The feedback-only save failure and 320px save failure states return zero violations. Stories hosted in the current production Trip shell inherit its existing small pink `Planning` contrast violation (3.83:1) plus an overlap-dependent contrast result; this prototype does not change production shell CSS. The initial duplicate prototype also exposed existing `TripCard` contrast and heading-order issues, so the review-only duplicate context now uses an accessible local card rather than hiding those findings.

Screenshot evidence cannot prove full keyboard, announcement or focus compliance. Those behaviours are also exercised directly in Storybook.

## Storybook review set

Title: `Patterns / Confirmation, Success & Recovery`

- `TripSaveInteractive`
- `TripSaveSaving`
- `ReducedMotionSaving`
- `TripSaveSavedToAccount`
- `TripSaveFailedDeviceSafe`
- `NightsChangedInline`
- `PrepTaskCompleted`
- `BriefTripDuplicatedNotice`
- `HarmlessAutoDismissNotice`
- `PersistentRouteRecovery`
- `CloudConflictChoice`
- `ConsequentialStopRemoval`
- `AffiliateBoundary`
- `Mobile320SaveFailure`
- `Mobile390Dialog`
- `Tablet768AffiliateBoundary`
- `DialogFocusAndRestore`

## Recommended rollout after visual approval

1. Correct ambiguous Map and Builder local-versus-account labels using the quiet save status.
2. Replace dashboard deletion and device-copy discard native confirms with the consequence dialog. Keep reversible archive/restore dialog-free.
3. Add the brief duplicate confirmation where dashboard resorting can hide the copy.
4. Align persistent Builder, Map, Dashboard and shell recovery only where their safety and retry semantics genuinely match.
5. Keep night, stop-order and Prep completion feedback inline.
6. Preserve the affiliate boundary and do not add a new booking workflow as part of feedback migration.

Migrate and visually verify one surface at a time. Do not introduce a global provider merely to make feedback technically uniform.

## Patterns deliberately rejected

- Global toast stack.
- Success toast after every save, toggle or direct manipulation.
- Giant green success panel, giant checkmark, confetti or gamification.
- Duplicate task card + 100% progress + completion panel + toast.
- Confirmation dialog for reversible actions.
- Auto-dismissed error, recovery or conflict.
- `Saved` without naming account or device when that distinction matters.
- `Are you sure?` without the consequence.
- Booking or payment success after an affiliate click.
- A newly invented manual booking workflow for this mockup.
- Production-wide migration before visual review.
