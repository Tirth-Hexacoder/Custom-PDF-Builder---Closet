import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const imageDir = path.join(projectRoot, "public", "publicImages");
const outputFile = path.join(projectRoot, "src", "data", "imageList.json");

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const imageTypeCycle = ["2D Default", "2D", "Stretched", "Isometric", "3D", "Wall"];

function getImageUrls() {
  if (!fs.existsSync(imageDir)) return [];

  return fs
    .readdirSync(imageDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => imageExtensions.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => `/publicImages/${name}`);
}

function getExistingImageMap() {
  if (!fs.existsSync(outputFile)) return new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(outputFile, "utf8"));
    if (!Array.isArray(raw)) return new Map();
    const entries = raw
      .map((item) => {
        if (typeof item === "string") return { url: item };
        return item;
      })
      .filter((item) => item && typeof item === "object" && typeof item.url === "string");
    return new Map(entries.map((item) => [item.url, item]));
  } catch {
    return new Map();
  }
}

function getImageList() {
  const urls = getImageUrls();
  const existingMap = getExistingImageMap();
  return urls.map((url, index) => {
    const existing = existingMap.get(url);
    const type = existing?.type || imageTypeCycle[index % imageTypeCycle.length];
    if (existing) {
      return {
        url,
        type,
        notes: Array.isArray(existing.notes) ? existing.notes : [],
        baseUrl: typeof existing.baseUrl === "string" ? existing.baseUrl : ""
      };
    }
    return {
      url,
      type,
      notes: [],
      baseUrl: ""
    };
  });
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
