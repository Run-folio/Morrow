# Day planning and starter staging plan

Approved scope: continue both features through staging; production deployment prohibited. Preserve all current day imagery, map, stay context, notes, editing, saved ideas and desktop behavior. Reuse RichItineraryDayPlanner periods, existing contextual Add panel, shared controls and canonical mutation owner. Mobile exposes the same Morning/Midday/Afternoon/Evening sections and direct contextual Add actions. Existing general Add/Saved ideas chooser remains and gains Midday.

- [x] Verify current remote main/staging and staging site identity; integrate starter onto real e481b7a history in isolated clone.
- [x] Write failing mobile-daypart regression; expose existing sections/actions and Midday.
- [ ] Run planner/starter/persistence regressions, UI audit, typecheck, build and Storybook; independent review.
- [ ] Push only HEAD:staging; verify exact ready Netlify deploy and staging health; confirm main unchanged.
- [ ] Hosted guest save/reload, starter focus/skip/shortlist, mobile contextual Midday Add, real provider states and responsive checks. Use isolated browser data; no existing user trip mutation or production deployment.
