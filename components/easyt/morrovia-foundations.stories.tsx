import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { EasyTButton } from "./easyt-controls";

const colors = [
  ["Primary ink", "--morrovia-ink"],
  ["Soft ink", "--morrovia-ink-soft"],
  ["Action", "--morrovia-action"],
  ["Signal", "--morrovia-signal"],
  ["Paper", "--morrovia-paper"],
  ["Lilac", "--morrovia-lilac"],
  ["Tint", "--morrovia-tint"],
  ["Success", "--morrovia-success"],
  ["Warning", "--morrovia-warning"],
  ["Danger", "--morrovia-danger"],
  ["Line", "--morrovia-line"],
] as const;

const meta = {
  title: "Morrovia/01 Foundations/Token baseline",
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const MorroviaBaseline: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 32, maxWidth: 980, color: "var(--morrovia-ink)" }}>
      <section>
        <p style={{ margin: "0 0 8px", color: "var(--morrovia-signal)", font: "800 11px/1.2 var(--morrovia-meta)", letterSpacing: ".12em" }}>LIVE PRODUCTION TOKENS</p>
        <h1 style={{ margin: 0, font: "600 42px/1 var(--morrovia-display)", letterSpacing: "-.045em" }}>Morrovia visual baseline</h1>
      </section>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
        {colors.map(([label, token]) => <div key={token} style={{ display: "grid", gap: 8 }}>
          <div style={{ height: 72, border: "1px solid var(--morrovia-line)", borderRadius: "var(--morrovia-control-radius)", background: `var(${token})` }} />
          <strong style={{ font: "700 13px/1.2 var(--morrovia-ui)" }}>{label}</strong>
          <code style={{ color: "var(--morrovia-muted)", font: "11px/1.3 var(--morrovia-meta)" }}>{token}</code>
        </div>)}
      </section>
      <section style={{ display: "grid", gap: 16, padding: 20, border: "1px solid var(--morrovia-line)", borderRadius: "var(--morrovia-radius)", background: "#fff" }}>
        <div><small style={{ color: "var(--morrovia-signal)", font: "800 10px/1.2 var(--morrovia-meta)", letterSpacing: ".12em" }}>DISPLAY / EDITORIAL</small><div style={{ marginTop: 6, font: "600 34px/1 var(--morrovia-display)", letterSpacing: "-.045em" }}>Complex trips, made simple.</div></div>
        <div><small style={{ color: "var(--morrovia-muted)", font: "700 10px/1.2 var(--morrovia-meta)", letterSpacing: ".12em" }}>UI / SANS</small><p style={{ margin: "6px 0 0", font: "16px/1.5 var(--morrovia-ui)" }}>Clear, calm controls and information-rich planning surfaces.</p></div>
        <div><small style={{ color: "var(--morrovia-muted)", font: "700 10px/1.2 var(--morrovia-meta)", letterSpacing: ".12em" }}>METADATA / MONO</small><p style={{ margin: "6px 0 0", font: "800 11px/1.2 var(--morrovia-meta)", letterSpacing: ".1em" }}>AUG 20 · DAY 01 · TOKYO</p></div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <span style={{ padding: "10px 14px", border: "1px solid var(--morrovia-line)", borderRadius: "var(--morrovia-control-radius)", font: "700 12px var(--morrovia-ui)" }}>Control radius</span>
          <span style={{ padding: "14px 18px", border: "1px solid var(--morrovia-line)", borderRadius: "var(--morrovia-radius)", font: "700 12px var(--morrovia-ui)" }}>Editorial card radius</span>
          <EasyTButton style={{ boxShadow: "0 0 0 3px var(--morrovia-focus-ring)" }}>Focus treatment</EasyTButton>
        </div>
      </section>
    </div>
  ),
};
