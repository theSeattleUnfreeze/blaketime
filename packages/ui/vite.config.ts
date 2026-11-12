import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
const product = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { version: string };
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(product.version) },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3000" },
  },
  build: {
    outDir: "../../dist/ui",
    emptyOutDir: true,
    target: ["es2022", "safari15"],
    sourcemap: false,
  },
});
