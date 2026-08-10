import type { Preview } from "@storybook/nextjs-vite";
import "../app/globals.css";

const preview: Preview = {
  parameters: {
    a11y: { test: "todo" },
    controls: { expanded: true },
    backgrounds: { default: "EasyT paper", values: [{ name: "EasyT paper", value: "#f7f6f3" }] },
  },
};

export default preview;
