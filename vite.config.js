import { readFile } from "node:fs/promises";
import { defineConfig } from "vite";

const staticFiles = [
  {
    source: "src/content/content.css",
    output: "content/content.css"
  },
  {
    source: "src/popup/popup.css",
    output: "popup/popup.css"
  },
  {
    source: "src/popup/popup.html",
    output: "popup/popup.html"
  }
];

function chromeExtensionStaticAssets() {
  return {
    name: "chrome-extension-static-assets",
    async generateBundle() {
      const manifest = JSON.parse(await readFile("src/manifest.json", "utf8"));

      manifest.content_scripts = manifest.content_scripts.map((script) => ({
        ...script,
        js: ["content/content.js"]
      }));

      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: `${JSON.stringify(manifest, null, 2)}\n`
      });

      for (const { source, output } of staticFiles) {
        this.emitFile({
          type: "asset",
          fileName: output,
          source: await readFile(source)
        });
      }
    }
  };
}

export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: "dist",
    rollupOptions: {
      input: {
        "content/content": "src/content/index.js",
        "popup/popup": "src/popup/popup.js"
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "[name][extname]"
      }
    }
  },
  plugins: [chromeExtensionStaticAssets()]
});
