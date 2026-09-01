import type { Preview } from "@storybook/nextjs-vite";
import "../app/globals.css";
import "../app/journey/journey-design.css";
import { resetStorybookAuthOwner } from "./auth-client.mock";

const preview: Preview = {
  beforeEach: () => {
    resetStorybookAuthOwner();
  },
  parameters: {
    a11y: { test: "todo" },
    controls: { expanded: true },
    options: {
      storySort: {
        order: [
          "Morrovia",
          [
            "01 Foundations",
            "02 Controls",
            "03 Status & Feedback",
            "04 Structure",
            "05 Product Patterns",
            "06 Audit",
          ],
        ],
      },
    },
    backgrounds: { default: "Morrovia paper", values: [{ name: "Morrovia paper", value: "var(--morrovia-paper)" }] },
    viewport: {
      options: {
        morrovia320: { name: "Morrovia 320", styles: { width: "320px", height: "640px" } },
        morrovia390: { name: "Morrovia 390", styles: { width: "390px", height: "844px" } },
        morrovia430: { name: "Morrovia 430", styles: { width: "430px", height: "932px" } },
        morrovia768: { name: "Morrovia 768", styles: { width: "768px", height: "1024px" } },
        morrovia1024: { name: "Morrovia 1024", styles: { width: "1024px", height: "900px" } },
        morrovia1440: { name: "Morrovia 1440", styles: { width: "1440px", height: "1000px" } },
        morrovia1680: { name: "Morrovia 1680", styles: { width: "1680px", height: "1050px" } },
      },
    },
  },
};

export default preview;
