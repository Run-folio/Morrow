# Final main gates — local evidence

Starting candidate: `e2f4c7e82aab29746764204e80ba65bff5cf546d`. Previous staging base: `8a29efc0e6b6dafff1f70bb111f38c2ecb57cda0`.

## Prompt release gate

The Release workflow uses Node 22, `npm ci`, then `npm run release:gate`. That script runs `npm run test:prompt-engine` after UI, runtime and type gates, and before the planner, Builder and build gates. On Node 22.23.3, `npm run test:prompt-engine` failed identically at both the previous staging base and an archived snapshot of the frozen candidate: **206/208**, with state preservation **30/32**. All 15 other cases matched the baseline. The sole difference was `southeast-asia-fixed-anchor`: expected 14, actual 12; expected state preservation 2, actual 0; `canonical place identity changed`.

That fixture expected canonical `vietnam` from the traveller's phrase “southern Vietnam”. The accepted broad-area change in `8a29efc` retains that exact phrase as unresolved regional intent with Vietnam as its parent country, rather than silently expanding it into a whole-country stop or inventing a city. The correction keeps the 208-point baseline and checks the intended state positively: named region, unresolved status, parent country, no canonical Vietnam stop. Negative tests prove a changed region or a prohibited canonical stop loses the state-preservation points.

[All 16 cases, expected and observed scores by dimension](./prompt-engine-case-comparison.json) records the previous SHA, frozen candidate and corrected result.

## Transfer presentation

The production Overview projection already counted distinct canonical legs for `route-integrity` recommendations, but it showed raw recommendation wording for other leg-scoped transport findings. It now uses the same distinct-leg count for either case and retains the underlying issue messages as details. A warning without a canonical affected leg remains unnumbered. No canonical leg or integrity detection changed.

The production Overview Storybook cases were checked at 390 and 1440 CSS px. The single-leg story displays `1 transfer needs checking`; the two-leg story displays `2 transfers need checking`. Both widths had document width equal to viewport width. The healthy route story had no transfer-attention panel. Captures: [single, 390](./one-transfer-390.png), [two, 390](./two-transfers-390.png), [single, 1440](./one-transfer-1440.png), [two, 1440](./two-transfers-1440.png). Overview currently has English copy only; no Spanish locale path is wired on that production surface.

## Feedback hosted acceptance checklist

Use two fresh authenticated staging accounts and the normal app flow. Do not seed survey or active-use state.

1. **Account A:** complete an approved meaningful planning action and stay in trusted foreground use for the required 10 minutes. Enter an eligible Journey workspace at a quiet moment; verify one invitation appears. Open it deliberately, choose an accessible rating, add an optional note, submit, and observe success. Hard reload and navigate between eligible workspaces; confirm the invitation stays suppressed. Retry the same submission identity through the normal client flow if available and confirm no duplicate response.
2. **Account B:** independently qualify, observe the invitation, dismiss it, then reload and navigate between workspaces. Confirm the dismissal persists for this account and Account A's state is not reused.

The local Storybook browser suite uses fixture eligibility and mocked API responses to verify mounting, route-only Overview, account isolation, dismissal, submission, replay, suppression and retry behavior. It does not replace this hosted authenticated check.
