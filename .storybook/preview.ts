import type { Preview } from "@storybook/nextjs-vite";
import "../app/globals.css";
import "../app/journey/journey-design.css";

const preview: Preview = {
  parameters: {
    a11y: { test: "todo" },
    controls: { expanded: true },
    backgrounds: { default: "Morrovia paper", values: [{ name: "Morrovia paper", value: "#fbfaff" }] },
    viewport: {
      options: {
        morrovia320: { name: "Morrovia 320", styles: { width: "320px", height: "640px" } },
        morrovia390: { name: "Morrovia 390", styles: { width: "390px", height: "844px" } },
        morrovia430: { name: "Morrovia 430", styles: { width: "430px", height: "932px" } },
        morrovia768: { name: "Morrovia 768", styles: { width: "768px", height: "1024px" } },
      },
    },
  },
};

export default preview;
