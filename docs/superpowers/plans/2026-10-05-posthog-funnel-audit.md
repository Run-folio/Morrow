# PostHog funnel audit and repair

1. Trace the actual Homepage → Builder → Build → Save → workspace → itinerary/stay → affiliate event owners and consent boundaries. Record the existing event map before editing.
2. Test and repair evidenced gaps: production-only PostHog initialization, accepted direct itinerary additions, accepted Stay choice, and Stay affiliate reporting taxonomy. Preserve the existing event names for working steps and keep one event per deliberate action.
3. Run consent on/off and interaction checks, focused analytics/commercial tests, typecheck, build, and diff review. Commit only this local worktree and report remaining limits without live PostHog access.
