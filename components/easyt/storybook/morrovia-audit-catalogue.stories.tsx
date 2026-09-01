import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import {
  AuditButtons,
  AuditCards,
  AuditCanonicalOwnership,
  AuditColours,
  AuditFormControls,
  AuditIntentionalExceptions,
  AuditNavigation,
  AuditOverview,
  AuditProductPatterns,
  AuditResponsive,
  AuditStatus,
  AuditTypography,
} from "./morrovia-storybook-catalogue";

const meta = {
  title: "Morrovia/06 Audit",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const InventoryAndOwnership: Story = { name: "Inventory & ownership", render: () => <AuditOverview /> };
export const CanonicalOwnership: Story = { name: "Canonical ownership", render: () => <AuditCanonicalOwnership /> };
export const TypographyComparison: Story = { render: () => <AuditTypography /> };
export const ColourComparison: Story = { render: () => <AuditColours /> };
export const ButtonComparison: Story = { render: () => <AuditButtons /> };
export const FormControlComparison: Story = { name: "Form-control comparison", render: () => <AuditFormControls /> };
export const CardComparison: Story = { render: () => <AuditCards /> };
export const StatusComparison: Story = { render: () => <AuditStatus /> };
export const NavigationComparison: Story = { render: () => <AuditNavigation /> };
export const ProductPatternComparison: Story = { name: "Product-pattern comparison", render: () => <AuditProductPatterns /> };
export const ResponsiveComparison: Story = { render: () => <AuditResponsive /> };
export const IntentionalExceptions: Story = { render: () => <AuditIntentionalExceptions /> };
