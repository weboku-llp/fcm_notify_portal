import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // Bundle workspace TS packages into the output.
  noExternal: [/^@notif\//],
  // Prisma must stay external (needs real __dirname / query engine files).
  external: ["@prisma/client", ".prisma/client"],
  // Bundled CJS deps (pino, etc.) call require(); ESM needs createRequire.
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
});