import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect } from "react";
import {
  WorkspaceOrientationLauncher,
  WorkspaceOrientationProvider,
  useWorkspaceOrientationReady,
  useWorkspaceOrientationTarget,
  type WorkspaceOrientationTarget,
} from "./workspace-orientation";
import { writeWorkspaceOrientationState, type WorkspaceOrientationWorkspace } from "@/lib/easyt/workspace-orientation";
import styles from "./workspace-orientation.stories.module.css";

const targets: Record<WorkspaceOrientationWorkspace, { id: WorkspaceOrientationTarget; title: string; detail: string }[]> = {
  overview: [
    { id: "overview-next", title: "Your next step", detail: "Review the route before booking transport." },
    { id: "overview-progress", title: "Planning progress", detail: "Route, stays and practical preparation in one place." },
    { id: "workspace-navigation", title: "Overview · Map · Itinerary", detail: "Three connected views of this trip." },
  ],
  map: [
    { id: "map-stop", title: "Cusco", detail: "Selected route stop." },
    { id: "map-explore", title: "Stay · Eat · See", detail: "Explore around the selected destination." },
    { id: "map-result-actions", title: "Place actions", detail: "Save or add a useful place to the day." },
  ],
  itinerary: [
    { id: "itinerary-days", title: "Day 2 · Cusco", detail: "Choose a day to plan." },
    { id: "itinerary-planner", title: "Morning · Midday · Afternoon · Evening", detail: "Broad day parts, without fixed times." },
    { id: "itinerary-suggestions", title: "Suggestions for this day", detail: "Save an idea or add it to the plan." },
  ],
};

function Target({ workspace, target, title, detail }: { workspace: WorkspaceOrientationWorkspace; target: WorkspaceOrientationTarget; title: string; detail: string }) {
  const ref = useWorkspaceOrientationTarget(workspace, target);
  return <section ref={ref} className={styles.target}><h2>{title}</h2><p>{detail}</p></section>;
}

function Fixture({ workspace, ownerId, missingFirst = false, autoReady = true, completed = false }: { workspace: WorkspaceOrientationWorkspace; ownerId: string; missingFirst?: boolean; autoReady?: boolean; completed?: boolean }) {
  useWorkspaceOrientationReady(workspace, autoReady);
  useEffect(() => {
    if (completed) writeWorkspaceOrientationState(window.localStorage, ownerId, workspace, "completed");
  }, [completed, ownerId, workspace]);
  const visibleTargets = missingFirst ? targets[workspace].slice(-1) : targets[workspace];
  return <div className={styles.canvas}>
    <div className={styles.header}><WorkspaceOrientationLauncher /></div>
    <div className={styles.targets}>{visibleTargets.map((target) => <Target workspace={workspace} target={target.id} title={target.title} detail={target.detail} key={target.id} />)}</div>
  </div>;
}

function OrientationStory(props: Parameters<typeof Fixture>[0]) {
  return <WorkspaceOrientationProvider ownerId={props.ownerId}><Fixture {...props} /></WorkspaceOrientationProvider>;
}

const meta = {
  title: "Morrovia/04 Structure/Workspace orientation",
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: "/journey/storybook-trip" } } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const OverviewStep1: Story = { render: () => <OrientationStory workspace="overview" ownerId="story-overview-step-1" /> };
export const OverviewFinalStep: Story = {
  render: () => <OrientationStory workspace="overview" ownerId="story-overview-final" />,
  play: async ({ canvasElement }) => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    [...canvasElement.ownerDocument.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Next"))?.click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    [...canvasElement.ownerDocument.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Next"))?.click();
  },
};
export const MapStep: Story = { parameters: { nextjs: { appDirectory: true, navigation: { pathname: "/journey/storybook-trip/map" } } }, render: () => <OrientationStory workspace="map" ownerId="story-map" /> };
export const ItineraryStep: Story = { parameters: { nextjs: { appDirectory: true, navigation: { pathname: "/journey/storybook-trip/itinerary" } } }, render: () => <OrientationStory workspace="itinerary" ownerId="story-itinerary" /> };
export const MobileSheet390: Story = { parameters: { nextjs: { appDirectory: true, navigation: { pathname: "/journey/storybook-trip/itinerary" } } }, globals: { viewport: { value: "morrovia390", isRotated: false } }, render: () => <OrientationStory workspace="itinerary" ownerId="story-mobile-390" /> };
export const MissingTargetFallback: Story = { render: () => <OrientationStory workspace="overview" ownerId="story-missing-target" missingFirst /> };
export const CompletedManualReplay: Story = {
  render: () => <OrientationStory workspace="overview" ownerId="story-manual-replay" autoReady={false} completed />,
  play: async ({ canvasElement }) => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    [...canvasElement.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("More"))?.click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    [...canvasElement.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Show me around"))?.click();
  },
};
export const ReducedMotionStatic: Story = { parameters: { reducedMotion: "reduce" }, render: () => <OrientationStory workspace="overview" ownerId="story-reduced-motion" /> };
