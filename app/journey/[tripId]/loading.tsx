import { MorroviaSectionStatus } from "@/components/easyt/morrovia-loading-states";

export default function TripWorkspaceLoading() {
  return (
    <section
      style={{ minHeight: "45svh", display: "grid", placeItems: "center", width: "min(100% - 32px, 720px)", marginInline: "auto" }}
    >
      <MorroviaSectionStatus
        title="Opening your route"
        detail="Keeping your trip details and planning choices intact while this view opens."
      />
    </section>
  );
}
