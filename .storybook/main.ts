import type { StorybookConfig } from "@storybook/nextjs-vite";
import { fileURLToPath } from "node:url";

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
