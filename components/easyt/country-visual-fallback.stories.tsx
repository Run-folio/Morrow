import type { Meta, StoryObj } from "@storybook/react";
import CountryVisualFallback from "./country-visual-fallback";

const meta = { title: "Morrovia/05 Product Patterns/Country visual fallback", component: CountryVisualFallback,
  decorators: [(Story) => <div style={{ width: 280, height: 170 }}><Story /></div>] } satisfies Meta<typeof CountryVisualFallback>;
export default meta;
type Story = StoryObj<typeof meta>;
export const VerifiedCountry: Story = { args: { country: "Philippines" } };
export const UnknownCountry: Story = { args: { country: "Not a country" } };
