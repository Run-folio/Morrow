import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("one shared dialog owns Escape, scroll lock, focus return and a single scroll body", () => {
  const shell = read("components/easyt/builder-clarification-shell.tsx");
  assert.equal((shell.match(/role="dialog"/g) ?? []).length, 1);
  assert.match(shell, /event\.key === "Escape"/);
  assert.match(shell, /document\.body\.style\.overflow = "hidden"/);
  assert.match(shell, /returnFocus\?\.focus\(\)/);
  assert.match(shell, /className=\{styles\.body\}/);
  assert.doesNotMatch(shell, /history\.(pushState|popstate)/);
  assert.doesNotMatch(read("components/easyt/discovery-modal.tsx"), /role="dialog"|history\.(pushState|popstate)/);
});

test("mobile Discovery has one scroll body and safe-area clearance below the last card", () => {
  const css = read("components/easyt/builder-clarification-dialog.module.css");
  assert.match(css, /\.discoveryDialog\s*\{[^}]*height:\s*100dvh/);
  assert.match(css, /\.discoveryDialog \.body\s*\{[^}]*overflow-y:\s*auto/);
  assert.doesNotMatch(css, /\.discoveryDialog\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(css, /\.discoveryDialog \.footer\s*\{[^}]*env\(safe-area-inset-bottom\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("normal typed and sparse entries select Discovery; only recovery selects legacy renderer", () => {
  const builder = read("app/journey/new/trip-builder.tsx");
  assert.match(builder, /discoveryEntryForBrief\(/);
  assert.match(builder, /renderedDiscoveryEntry\.kind === "legacy-recovery"/);
  assert.match(builder, /<DiscoveryModal/);
  assert.match(builder, /<BuilderClarificationDialog/);
  assert.match(builder, /discoveryEntry\.kind !== "skip"/);
});

test("Back changes only the draft step and does not route browser history", () => {
  const modal = read("components/easyt/discovery-modal.tsx");
  assert.match(modal, /onAction\(\{ type: "set-step", step: previousStep \}\)/);
  assert.doesNotMatch(modal, /history\.(pushState|replaceState|popstate)/);
});

test("partial confirmation leaves the parent open and explains unresolved choices in review", () => {
  const builder = read("app/journey/new/trip-builder.tsx");
  const modal = read("components/easyt/discovery-modal.tsx");
  assert.match(builder, /commitDiscoveryReview\(/);
  assert.match(builder, /if \(!result\.ok\)[\s\S]*?return;/);
  assert.match(modal, /search\?\.error[^\n]*role="alert"/);
});

test("provider-only search has a localized unresolved path with preserved intent", () => {
  const builder = read("app/journey/new/trip-builder.tsx");
  assert.match(builder, /discoveryProjection\.places\.find\(\(place\) => place\.id === suggestion\.canonicalPlaceId/);
  assert.match(builder, /!suitablePlace \|\| !reviewedPlace/);
  assert.match(builder, /Your original idea is saved; search for another place or Finish later/);
  assert.match(builder, /Tu idea original sigue guardada; busca otro lugar o termina más tarde/);
});

test("global visual steps own direction, shortlist, and progressive display without country gates", () => {
  const steps = read("components/easyt/discovery-steps.tsx");
  const modal = read("components/easyt/discovery-modal.tsx");
  assert.match(modal, /<DiscoverySteps/);
  assert.match(steps, /type: "change-direction"/);
  assert.match(steps, /type: "set-step", step: "places"/);
  assert.match(steps, /"remove-shortlist" : "add-shortlist"/);
  assert.match(steps, /availableActions\(place\)/);
  assert.match(steps, /visiblePlaceIds/);
  assert.doesNotMatch(steps, /projection\.recommendedIds\.includes\(place\.id\)/);
  assert.doesNotMatch(steps, /Australia|places\.length\s*[><=]+\s*20/);
});

test("the adaptive shell has an honest loading and sparse recovery presentation", () => {
  const modal = read("components/easyt/discovery-modal.tsx");
  const stories = read("components/easyt/discovery-modal.stories.tsx");
  assert.match(modal, /loading\?: boolean/);
  assert.match(modal, /copy\.status\.loading/);
  assert.match(modal, /MorroviaSkeleton/);
  assert.match(stories, /AustraliaLoading/);
  assert.match(stories, /TajLandmarkProductionSparse/);
  assert.match(stories, /AustraliaSaveError/);
});

test("visual Discovery uses the modal title and secondary geography without duplicate step headings", () => {
  const modal = read("components/easyt/discovery-modal.tsx");
  const steps = read("components/easyt/discovery-steps.tsx");
  assert.match(modal, /title=\{copy\.steps\[step\]\}/);
  assert.match(modal, /description=\{name\}/);
  assert.doesNotMatch(steps, /<h3>|styles\.eyebrow\}>\{copy\.steps/);
  assert.doesNotMatch(steps, /<p className=\{styles\.truth\}>/);
});

test("Builder commit locks every Discovery navigation and dismissal path", () => {
  const builder = read("app/journey/new/trip-builder.tsx");
  const modal = read("components/easyt/discovery-modal.tsx");
  const shell = read("components/easyt/builder-clarification-shell.tsx");
  assert.match(builder, /loading=\{discoveryCommitting\}/);
  assert.match(modal, /onDismiss=\{\(\) => handleClose\("closed"\)\}[^>]*loading=\{loading\}/);
  assert.match(modal, /previousStep \? <EasyTButton disabled=\{loading\}/);
  assert.match(modal, /variant="quiet" disabled=\{loading\} onClick=\{\(\) => handleClose\("finish_later"\)\}/);
  assert.match(shell, /if \(event\.key === "Escape"\) \{ event\.preventDefault\(\); if \(!loadingRef\.current\) dismissRef\.current\(\);/);
  assert.match(shell, /if \(event\.target === event\.currentTarget && !loading\) onDismiss\(\)/);
  assert.match(shell, /iconOnly variant="quiet" size="small" disabled=\{loading\}/);
  assert.match(modal, /loading \? <section className=\{styles\.loading\}[\s\S]*?: <DiscoverySteps/);
  assert.match(builder, /onAction=\{\(action\) => \{\s*if \(discoveryCommitRef\.current\) return;/);
});

test("Builder confirmation uses the same fail-closed review gate and base as Discovery", () => {
  const builder = read("app/journey/new/trip-builder.tsx");
  assert.match(builder, /const review = canonicalDiscoveryReview/);
  assert.match(builder, /canonicalReview=\{canonicalDiscoveryReview\}/);
  assert.match(builder, /!review\?\.canConfirm/);
});

test("Discovery exposes explicit base, split, reset and reviewed search actions without early route mutation", () => {
  const steps = read("components/easyt/discovery-steps.tsx");
  const modal = read("components/easyt/discovery-modal.tsx");
  const builder = read("app/journey/new/trip-builder.tsx");
  assert.match(steps, /copy\.actions\.stayHere/);
  assert.match(steps, /copy\.actions\.visitFromBase/);
  assert.match(steps, /copy\.actions\.splitStay/);
  assert.match(modal, /type: "reset"/);
  assert.match(modal, /draft\.removedIds\.length/);
  assert.match(builder, /selectCanonicalSearchResult\(/);
  assert.match(builder, /discoveryPlaceWithinMention\(/);
  assert.match(builder, /discoveryBaseSuitableForMention\(/);
  assert.match(builder, /reviewedPlace\.actionability === "browse-only"/);
  assert.match(modal, /contextCountries=\{mention\.parentCountries\}/);
  assert.match(modal, /includeNonRoutable/);
  assert.doesNotMatch(modal, /parentConstraint=\{entry\.kind/);
  assert.match(builder, /onClose=\{\(\) => \{[\s\S]*?persistDeviceRecovery\(activeTripDocument\)/);
  assert.match(modal, /saveError \? <MorroviaStatusBanner/);
});
