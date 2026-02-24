import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const imageDir = path.resolve(process.cwd(), "public", "publicImages");
const imageListFile = path.resolve(process.cwd(), "src", "data", "imageList.json");
const allowedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

function syncImageList() {
  if (!fs.existsSync(imageDir)) return false;

  const list = fs
    .readdirSync(imageDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => allowedExtensions.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => `/publicImages/${name}`);

  const content = `${JSON.stringify(list, null, 2)}\n`;
  const current = fs.existsSync(imageListFile) ? fs.readFileSync(imageListFile, "utf8") : "";
  if (current === content) return false;

  fs.mkdirSync(path.dirname(imageListFile), { recursive: true });
  fs.writeFileSync(imageListFile, content, "utf8");
  return true;
}

function autoImageListPlugin() {
  const imageDirNormalized = imageDir.replace(/\\/g, "/");
  const isInsideImageDir = (file) => file.replace(/\\/g, "/").startsWith(`${imageDirNormalized}/`);

  return {
    name: "auto-image-list",
    buildStart() {
      syncImageList();
    },
    configureServer(server) {
      syncImageList();
      server.watcher.add(imageDir);

      const onFsUpdate = (file) => {
        if (!isInsideImageDir(file)) return;
        const changed = syncImageList();
        if (changed) {
          server.ws.send({ type: "full-reload" });
        }
      };

      server.watcher.on("add", onFsUpdate);
      server.watcher.on("unlink", onFsUpdate);
      server.watcher.on("change", onFsUpdate);
    }
  };
}

export default defineConfig({
  plugins: [react(), autoImageListPlugin()],
  server: { port: 5173 }
});
