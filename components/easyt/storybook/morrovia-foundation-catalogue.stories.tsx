import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import {
  BordersRadiiFoundation,
  BreakpointsFoundation,
  ColourFoundation,
  IconsFoundation,
  LayoutFoundation,
  ShadowsFoundation,
  SpacingFoundation,
  TypographyFoundation,
} from "./morrovia-storybook-catalogue";

const meta = {
  title: "Morrovia/01 Foundations",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Typography: Story = { render: () => <TypographyFoundation /> };
export const Colours: Story = { render: () => <ColourFoundation /> };
export const Spacing: Story = { render: () => <SpacingFoundation /> };
export const BordersAndRadii: Story = { name: "Borders & radii", render: () => <BordersRadiiFoundation /> };
export const Shadows: Story = { render: () => <ShadowsFoundation /> };
export const Icons: Story = { render: () => <IconsFoundation /> };
export const LayoutAndWidths: Story = { name: "Layout & widths", render: () => <LayoutFoundation /> };
export const Breakpoints: Story = { render: () => <BreakpointsFoundation /> };
