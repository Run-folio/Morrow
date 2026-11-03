import type { StorybookConfig } from "@storybook/nextjs-vite";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const callbackFirstLinkMock = require.resolve("@storybook/nextjs-vite/link.mock");

const config: StorybookConfig = {
  stories: [
    "../components/**/*.stories.@(js|jsx|mjs|ts|tsx)",
    "../app/**/*.stories.@(js|jsx|mjs|ts|tsx)",
  ],
  addons: ["@storybook/addon-a11y"],
  framework: {
    name: "@storybook/nextjs-vite",
    options: {},
  },
  staticDirs: ["../public"],
  viteFinal: async (viteConfig) => {
    const configuredAliases = Array.isArray(viteConfig.resolve?.alias)
      ? viteConfig.resolve.alias
      : Object.entries(viteConfig.resolve?.alias ?? {}).map(([find, replacement]) => ({ find, replacement }));

    return {
      ...viteConfig,
      resolve: {
        ...viteConfig.resolve,
        alias: [
          { find: "@/lib/auth-client", replacement: fileURLToPath(new URL("./auth-client.mock.ts", import.meta.url)) },
          ...configuredAliases,
        ],
      },
      server: {
        ...viteConfig.server,
        allowedHosts: ["127.0.0.1", "localhost"],
      },
      optimizeDeps: {
        ...viteConfig.optimizeDeps,
        exclude: [...(viteConfig.optimizeDeps?.exclude ?? []), "maplibre-gl"],
      },
      plugins: [
        ...(viteConfig.plugins ?? []),
        {
          // vite-plugin-storybook-nextjs pre-cancels Link clicks before the app callback.
          // Use the installed framework mock, which calls the app first and respects cancellation.
          // This runs after the framework's normal mock alias hook; shared dependencies stay untouched.
          name: "morrovia-storybook-link-callback-order",
          enforce: "post",
          config: () => ({ resolve: { alias: [
            "next/link", "@storybook/nextjs/link.mock", "@storybook/nextjs-vite/link.mock", "@storybook/experimental-nextjs-vite/link.mock",
          ].map(find => ({ find, replacement: callbackFirstLinkMock })) } }),
        },
        {
          name: "storybook-json-import-attributes",
          enforce: "post",
          transform(code, id) {
            if (!/\.[cm]?[jt]sx?(?:\?|$)/.test(id) || !/\s(?:with|assert)\s+\{\s*type:\s*["']json["']\s*\}/.test(code)) return null;
            return code.replace(/\s+(?:with|assert)\s+\{\s*type:\s*["']json["']\s*\}/g, "");
          },
        },
      ],
    };
  },
};

export default config;
