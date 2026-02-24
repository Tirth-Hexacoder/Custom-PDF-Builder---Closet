import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const imageDir = path.join(projectRoot, "public", "publicImages");
const outputFile = path.join(projectRoot, "src", "data", "imageList.json");

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

function getImageList() {
  if (!fs.existsSync(imageDir)) return [];

  return fs
    .readdirSync(imageDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => imageExtensions.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => `/publicImages/${name}`);
}

function writeImageList() {
  const list = getImageList();
  const json = `${JSON.stringify(list, null, 2)}\n`;

  if (!fs.existsSync(path.dirname(outputFile))) {
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  }

  const current = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, "utf8") : "";
  if (current === json) return;

  fs.writeFileSync(outputFile, json, "utf8");
  console.log(`Synced ${list.length} images to src/data/imageList.json`);
}

writeImageList();
