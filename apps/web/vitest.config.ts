import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const srcDir = decodeURIComponent(new URL("./src", import.meta.url).pathname).replace(
  /^\/([A-Za-z]:)/,
  "$1",
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": srcDir,
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});

