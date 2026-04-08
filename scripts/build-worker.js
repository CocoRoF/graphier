/**
 * Pre-build step: bundle layout.worker.ts into an inline string module.
 * Output: src/layout/worker-inline.ts (auto-generated)
 */
import { build } from "vite";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

async function main() {
  // Bundle the worker as IIFE
  await build({
    configFile: false,
    build: {
      lib: {
        entry: resolve(ROOT, "src/layout/layout.worker.ts"),
        formats: ["iife"],
        name: "LayoutWorker",
        fileName: () => "layout-worker-bundle.js",
      },
      outDir: resolve(ROOT, ".worker-tmp"),
      emptyOutDir: true,
      minify: true,
      sourcemap: false,
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
      },
    },
  });

  // Read the bundled output
  const bundled = readFileSync(
    resolve(ROOT, ".worker-tmp/layout-worker-bundle.js"),
    "utf-8"
  );

  // Write as inline module
  const output = `// AUTO-GENERATED — do not edit. Run: node scripts/build-worker.js
const WORKER_SOURCE = ${JSON.stringify(bundled)};

export function createLayoutWorker(): Worker {
  const blob = new Blob([WORKER_SOURCE], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);
  // Clean up the blob URL after the worker starts
  URL.revokeObjectURL(url);
  return worker;
}
`;

  writeFileSync(resolve(ROOT, "src/layout/worker-inline.ts"), output);
  console.log("✓ Worker inlined to src/layout/worker-inline.ts");
}

main().catch(console.error);
