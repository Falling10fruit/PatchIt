import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [solidPlugin()],
  clearScreen: false,
  server: { port: 2314 },
  build: { target: 'esnext' },
}));
