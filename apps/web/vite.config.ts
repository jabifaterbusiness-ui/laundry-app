import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      // Runtime caching / offline strategy intentionally left minimal here.
      // The full offline/sync architecture is a planned module and should
      // be designed deliberately, not bolted on via default PWA caching.
      // NOTE: no icon assets exist yet (see manifest.icons below) -
      // intentionally left empty rather than referencing files that don't
      // exist or fabricating placeholder branding. Real icons are needed
      // before this manifest is production-usable (see report, section M).
      manifest: {
        name: "Laundry Management",
        short_name: "Laundry",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#1d4ed8",
        icons: [],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 5173 },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["tests/setup.ts"],
  },
});
