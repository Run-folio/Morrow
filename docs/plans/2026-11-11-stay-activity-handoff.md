# Stay and activity handoff

Approved scope: staging only, based on 3acb4c7. Preserve canonical trip data and all existing controls.

1. Compose the existing stay detail with a small read-only handoff: copy known property, stop, dates and traveller details; retain the exact configured Trip.com category link and its general-search qualification. Show shortlisted, selected and booked states accurately. No new inventory, prefilled-link claim or Today line.
2. Retain existing activity day/time selection and canonical save path. Expose the existing attributed Viator product link in contextual Add, with Not booked and affiliate disclosure. Preserve unavailable states.
3. Cover exact repeated-stop dates, unknown details, booking distinctions and immutable source links. Check copy success/failure and activity save/reload on real staging inventory when available.
4. Focused tests, typecheck, UI audit, Storybook and app build; independent booking/save review; push staging branch only and verify hosted desktop/mobile changes.

Reuse: EasyTButton, MorroviaAffiliateLink/Disclosure, ItineraryItemDetail, native detail sheet, existing status/fact layout and semantic tokens. The copy action is a unique stay-detail interaction, not a new dialog or persistence model.
