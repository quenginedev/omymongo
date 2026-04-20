import { defineConfig } from "vite-plus";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [dts({ insertTypesEntry: true })],
  test: { globalSetup: ["scripts/setupIntegrationTests.ts"] },
  staged: { "**/*.{ts,yml,js,json}": "pnpm check --fix" },
  pack: { dts: { tsgo: true }, exports: true },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
