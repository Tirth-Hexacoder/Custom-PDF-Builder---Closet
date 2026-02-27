import { A4_PX } from "@closet/core";
import { fabric } from "fabric";
import type { Page, SceneImageInput, SceneImageNote } from "../types";

const PREVIEW_TARGET_WIDTH = 180;
const PREVIEW_MULTIPLIER = PREVIEW_TARGET_WIDTH / A4_PX.width;

function setWhiteBackground(canvas: fabric.StaticCanvas) {
  canvas.setBackgroundColor("#ffffff", () => undefined);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function resolvePageDefaultImages(page: Page) {
  if (Array.isArray(page.defaultImages) && page.defaultImages.length > 0) {
    return page.defaultImages.filter((item): item is SceneImageInput => !!item && !!item.url);
  }
  if (page.defaultImage?.url) return [page.defaultImage];
  if (page.defaultImageUrl) {
    return [{
      url: page.defaultImageUrl,
      type: "2D Default" as const,
      notes: [],
      baseUrl: ""
    }];
  }
  return [] as SceneImageInput[];
}

function resolvePageDefaultLayout(page: Page, imageCount: number) {
  if (page.defaultLayout) return page.defaultLayout;
  if (imageCount <= 1) return "single" as const;
  if (imageCount === 3) return "hero-three" as const;
  return "grid-2-col" as const;
}

function buildDefaultImageCells(
  canvas: fabric.StaticCanvas,
  defaultImages: SceneImageInput[],
  layout: "single" | "grid-2-col" | "hero-three" | "stack" | "top-grid" | "wall-grid"
) {
  const margin = 40;
  const topMargin = 100;
  const bottomMargin = 70;
  const contentLeft = margin;
  const contentTop = topMargin;
  const contentWidth = canvas.getWidth() - margin * 2;
  const contentHeight = canvas.getHeight() - topMargin - bottomMargin;

  if (defaultImages.length === 0) return [] as Array<{
    image: SceneImageInput;
    left: number;
    top: number;
    width: number;
    height: number;
  }>;

  if (layout === "single") {
    return [{
      image: defaultImages[0],
      left: contentLeft,
      top: contentTop,
      width: contentWidth,
      height: contentHeight
    }];
  }

  if (layout === "hero-three") {
    const images = defaultImages.slice(0, 3);
    if (images.length < 3) {
      return images.map((image, index) => ({
        image,
        left: contentLeft + (index % 2) * (contentWidth / 2),
        top: contentTop + Math.floor(index / 2) * (contentHeight / Math.max(Math.ceil(images.length / 2), 1)),
        width: contentWidth / 2,
        height: contentHeight / Math.max(Math.ceil(images.length / 2), 1)
      }));
    }
    const topAreaHeight = contentHeight / 2;
    const lowerAreaTop = contentTop + topAreaHeight;
    const lowerAreaHeight = contentHeight - topAreaHeight;
    return [
      {
        image: images[0],
        left: contentLeft,
        top: contentTop,
        width: contentWidth,
        height: topAreaHeight
      },
      {
        image: images[1],
        left: contentLeft,
        top: lowerAreaTop,
        width: contentWidth / 2,
        height: lowerAreaHeight
      },
      {
        image: images[2],
        left: contentLeft + contentWidth / 2,
        top: lowerAreaTop,
        width: contentWidth / 2,
        height: lowerAreaHeight
      }
    ];
  }

  if (layout === "top-grid") {
    const heroImage = defaultImages[0];
    const gridImages = defaultImages.slice(1);
    if (!heroImage) return [] as Array<{
      image: SceneImageInput;
      left: number;
      top: number;
      width: number;
      height: number;
    }>;
    if (gridImages.length === 0) {
      return [{
        image: heroImage,
        left: contentLeft,
        top: contentTop,
        width: contentWidth,
        height: contentHeight
      }];
    }

    const gap = 12;
    const gridCount = gridImages.length;
    let cols = Math.min(3, Math.max(1, gridCount));
    const minWidth = contentWidth * 0.26;
    while (cols > 1 && ((contentWidth - gap * (cols - 1)) / cols) < minWidth) cols -= 1;
    const rows = Math.max(1, Math.ceil(gridCount / cols));

    const heroHeightRatio = gridCount <= 2 ? 0.62 : gridCount <= 4 ? 0.54 : 0.46;
    const heroHeight = Math.max(160, contentHeight * heroHeightRatio);
    const availableGridHeight = Math.max(120, contentHeight - heroHeight - gap);
    const cellWidth = (contentWidth - gap * (cols - 1)) / cols;
    const cellHeight = (availableGridHeight - gap * (rows - 1)) / rows;
    const gridTop = contentTop + heroHeight + gap;

    const cells = [{
      image: heroImage,
      left: contentLeft,
      top: contentTop,
      width: contentWidth,
      height: heroHeight
    }];

    gridImages.forEach((image, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      cells.push({
        image,
        left: contentLeft + col * (cellWidth + gap),
        top: gridTop + row * (cellHeight + gap),
        width: cellWidth,
        height: cellHeight
      });
    });
    return cells;
  }

  if (layout === "grid-2-col" || layout === "stack") {
    const images = defaultImages;
    const cols = images.length === 1 ? 1 : 2;
    const rows = Math.max(1, Math.ceil(images.length / cols));
    const cellWidth = contentWidth / cols;
    const cellHeight = contentHeight / rows;
    return images.map((image, index) => ({
      image,
      left: contentLeft + (index % cols) * cellWidth,
      top: contentTop + Math.floor(index / cols) * cellHeight,
      width: cellWidth,
      height: cellHeight
    }));
  }

  const wallImages = defaultImages.slice(0, 4);
  const wallCount = wallImages.length;
  const rows = wallCount <= 2 ? wallCount : 2;
  const cols = wallCount <= 2 ? 1 : 2;
  const cellWidth = contentWidth / Math.max(cols, 1);
  const cellHeight = contentHeight / Math.max(rows, 1);
  return wallImages.map((image, index) => {
    const row = cols === 1 ? index : Math.floor(index / cols);
    const col = cols === 1 ? 0 : index % cols;
    return {
      image,
      left: contentLeft + col * cellWidth,
      top: contentTop + row * cellHeight,
      width: cellWidth,
      height: cellHeight
    };
  });
}

function addImageNotes(canvas: fabric.StaticCanvas, img: fabric.Image, notes: SceneImageNote[]) {
  if (!Array.isArray(notes) || notes.length === 0) return;
  const left = img.left || 0;
  const top = img.top || 0;
  const width = img.getScaledWidth();
  const height = img.getScaledHeight();
  notes.forEach((note) => {
    if (!note?.text) return;
    const xPercent = clamp(Number(note.xPercent) || 0, 0, 100);
    const yPercent = clamp(Number(note.yPercent) || 0, 0, 100);
    const text = new fabric.Textbox(note.text, {
      left: left + (xPercent / 100) * width,
      top: top + (yPercent / 100) * height,
      fill: note.fontColor || "#111827",
      fontSize: Number(note.fontSize) || 18,
      fontFamily: note.fontType || "Georgia"
    });
    canvas.add(text);
  });
}

function syncNotesOnLoadedCanvas(canvas: fabric.StaticCanvas, page: Page) {
  const defaultImages = resolvePageDefaultImages(page);
  if (defaultImages.length === 0) return;
  const existingNoteObjects = canvas.getObjects().filter((obj) => obj.data?.source === "default-image-note");
  existingNoteObjects.forEach((obj) => canvas.remove(obj));
  const imageObjects = canvas.getObjects().filter((obj) => obj.type === "image") as fabric.Image[];
  const remainingImageObjects = [...imageObjects];

  defaultImages.forEach((defaultImage) => {
    let imageObject = imageObjects.find((obj) => obj.data?.defaultImageUrl === defaultImage.url);
    if (!imageObject && remainingImageObjects.length > 0) imageObject = remainingImageObjects[0];
    if (!imageObject) return;
    imageObject.set({
      data: {
        ...(imageObject.data || {}),
        defaultImageUrl: defaultImage.url,
        source: "default-image"
      }
    });
    const usedIndex = remainingImageObjects.indexOf(imageObject);
    if (usedIndex >= 0) remainingImageObjects.splice(usedIndex, 1);
    addImageNotes(canvas, imageObject, defaultImage.notes || []);
  });
}

export async function renderPagePreview(page: Page): Promise<string> {
  const el = document.createElement("canvas");
  const canvas = new fabric.StaticCanvas(el, {
    width: A4_PX.width,
    height: A4_PX.height,
    backgroundColor: "#ffffff"
  });
  setWhiteBackground(canvas);

  try {
    if (page.fabricJSON) {
      await new Promise<void>((resolve) => {
        canvas.loadFromJSON(page.fabricJSON, () => resolve());
      });
      syncNotesOnLoadedCanvas(canvas, page);
      setWhiteBackground(canvas);
    } else {
      const defaultImages = resolvePageDefaultImages(page);
      const defaultLayout = resolvePageDefaultLayout(page, defaultImages.length);
      const cells = buildDefaultImageCells(canvas, defaultImages, defaultLayout);
      for (const cell of cells) {
        // Keep preview rendering order deterministic.
        // eslint-disable-next-line no-await-in-loop
        await new Promise<void>((resolve) => {
          fabric.Image.fromURL(
            cell.image.url,
            (img) => {
              if (img) {
                const sourceWidth = img.width || 1;
                const sourceHeight = img.height || 1;
                const scale = Math.min(cell.width / sourceWidth, cell.height / sourceHeight, 1);
                img.scale(scale);
                img.set({
                  left: cell.left + (cell.width - img.getScaledWidth()) / 2,
                  top: cell.top + (cell.height - img.getScaledHeight()) / 2
                });
                canvas.add(img);
                addImageNotes(canvas, img, cell.image.notes || []);
              }
              resolve();
            },
            { crossOrigin: "anonymous" }
          );
        });
      }
    }

    setWhiteBackground(canvas);
    canvas.renderAll();
    return canvas.toDataURL({
      format: "jpeg",
      quality: 0.65,
      multiplier: PREVIEW_MULTIPLIER
    });
  } finally {
    canvas.dispose();
  }
}
