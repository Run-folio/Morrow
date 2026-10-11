import type { Meta, StoryObj } from "@storybook/react";
import CountryVisualFallback, { CountryIllustrationLabel } from "./country-visual-fallback";

const meta = { title: "Morrovia/05 Product Patterns/Country visual fallback", component: CountryVisualFallback,
  decorators: [(Story) => <div style={{ width: 280, height: 170 }}><Story /></div>] } satisfies Meta<typeof CountryVisualFallback>;
export default meta;
type Story = StoryObj<typeof meta>;
export const VerifiedCountry: Story = { args: { country: "Philippines" } };
export const UnknownCountry: Story = { args: { country: "Not a country" } };

export const IllustrativeCountry: Story = { render: () => <div style={{ position: "relative", width: "100%", height: "100%", background: "var(--morrovia-photo-ink)" }}><CountryIllustrationLabel country="Philippines" /></div> };
