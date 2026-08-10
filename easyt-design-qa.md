# EasyT visual QA

**Source visual truth**

- Portfolio navigation reference: user-supplied screenshot in the current task (Work dropdown, 2026-07-27).
- EasyT builder reference: user-supplied screenshot in the current task (builder shell, 2026-07-27).

**Implementation evidence**

- Local route: `http://127.0.0.1:3000/journey/new`
- Browser-rendered capture: `/private/tmp/easyt-builder-qa.png`
- Viewport / capture: 1280 × 720 CSS px, 1280 × 720 px output, 1× density.
- State: first builder step, with Guatemala City → Tokyo → Hong Kong populated.
- Runtime check: no console warnings or errors.

## Comparison history

### Iteration 1 — blocked

- [P1] Journey controls used a mono, square, navy-heavy UI that read as a separate product from the portfolio.
- [P1] The Work submenu used a special pink prototype card with low-contrast descriptive text, rather than the established case-study menu pattern.
- [P2] The builder header called the prototype `Tokyo Marathon+`, while the product itself was already branded EasyT.

### Fixes applied and verified

- Applied the portfolio's Geist sans control treatment, black primary actions, rounded pills, lighter borders and reduced builder elevation.
- Kept mono for compact metadata only, matching the existing portfolio category treatment.
- Rebuilt the Work submenu entry using the same typography, hover state and hierarchy as each existing case-study item.
- Renamed the entry to `EasyT` with the descriptor `Travel companion prototype`; updated the builder return label and eyebrow accordingly.
- `npm run build` passed; local console was clear.

## Fidelity surfaces

- **Fonts and typography:** Geist sans now owns headings, actions and buttons; Geist Mono is limited to compact labels/metadata.
- **Spacing and layout rhythm:** Existing builder structure is preserved; borders and reduced elevation align with the portfolio's calm, spacious composition.
- **Colors and tokens:** Primary actions use portfolio ink (`#000`), paper, hairline borders and signal pink.
- **Image quality and assets:** No visual assets changed; existing logo and icon-library usage remains intact.
- **Copy and content:** Prototype naming is consistently `EasyT` and `Travel companion prototype`.

## Findings

No actionable P0, P1 or P2 mismatches remain for this scope.

## Follow-up polish

- [P3] Consider a subtle divider before EasyT in the Work dropdown only if it becomes important to distinguish prototypes from case studies; the current version deliberately matches the normal project-item pattern.

**final result: passed**
