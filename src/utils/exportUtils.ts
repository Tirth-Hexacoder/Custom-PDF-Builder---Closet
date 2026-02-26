import { jsPDF } from "jspdf";
import { fabric } from "fabric";
import { A4_PX } from "@closet/core";
import type { ExportOptions, Page, RenderImageOptions, SceneImageInput, SceneImageNote } from "../types";
import { applyPageDecorations, DEFAULT_FOOTER_LOGO_URL, HEADER_ID } from "./pageDecorUtils";

const PDF_PAGE_WIDTH = 595;
const PDF_PAGE_HEIGHT = 842;
const EXPORT_PAGE_MULTIPLIER = 1;
const EXPORT_PAGE_QUALITY = 0.86;
const EXPORT_COVER_QUALITY = 0.86;

function setWhiteBackground(canvas: fabric.StaticCanvas) {
  canvas.setBackgroundColor("#ffffff", () => undefined);
}

function normalizeDimmedOpacityForExport(canvas: fabric.StaticCanvas) {
  const visit = (obj: fabric.Object) => {
    if (obj.data?.objectDimmed) {
      obj.set({ opacity: 1 });
    }
    if (obj.type === "group") {
      (obj as fabric.Group).getObjects().forEach((child) => visit(child as fabric.Object));
    }
  };
  canvas.getObjects().forEach((obj) => visit(obj));
}

// Generates Raster Image Using Given Options
function toDataUrl(canvas: fabric.StaticCanvas, options: RenderImageOptions) {
  const format = options.format ?? "png";
  const multiplier = options.multiplier ?? 2;
  const quality = options.quality ?? 0.9;
  return canvas.toDataURL({ format, multiplier, quality });
}

// Creates a Fabric Static Canvas (Page)
function createExportCanvas() {
  const el = document.createElement("canvas");
  const canvas = new fabric.StaticCanvas(el, {
    width: A4_PX.width,
    height: A4_PX.height,
    backgroundColor: "#ffffff"
  });
  setWhiteBackground(canvas);
  return canvas;
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

  if (layout === "grid-2-col" || layout === "stack" || layout === "top-grid") {
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

// Loads Data From Fabric JSON OR Adds Image To a Page
async function buildCanvasForPage(page: Page, options: RenderImageOptions) {
  const canvas = createExportCanvas();

  if (page.fabricJSON) {
    await new Promise<void>((resolve) => {
      canvas.loadFromJSON(page.fabricJSON, () => resolve());
    });
    syncNotesOnLoadedCanvas(canvas, page);
    normalizeDimmedOpacityForExport(canvas);
    setWhiteBackground(canvas);
  } else {
    const defaultImages = resolvePageDefaultImages(page);
    const defaultLayout = resolvePageDefaultLayout(page, defaultImages.length);
    const cells = buildDefaultImageCells(canvas, defaultImages, defaultLayout);
    for (const cell of cells) {
      // Keep export rendering deterministic.
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

  await applyPageDecorations(canvas, options);
  setWhiteBackground(canvas);
  canvas.renderAll();
  return canvas;
}

// Breaks All Fabric Objects Into Part ... If Single Object Adds Into List, If Already a Group Object Then Break That Also
function flattenObjects(objects: fabric.Object[]) {
  const list: fabric.Object[] = [];
  objects.forEach((obj) => {
    list.push(obj);
    if (obj.type === "group") {
      const groupObjects = (obj as fabric.Group).getObjects() as fabric.Object[];
      list.push(...flattenObjects(groupObjects));
    }
  });
  return list;
}

// Checking If the Fabric Object Is The Text Type
function isFabricTextObject(obj: fabric.Object) {
  return obj.type === "text" || obj.type === "i-text" || obj.type === "textbox";
}

// Checking The Font Family Of The Text
function mapFontFamily(fontFamily?: string) {
  const value = (fontFamily || "").toLowerCase();
  if (value.includes("courier") || value.includes("mono")) return "courier";
  if (value.includes("times") || value.includes("georgia") || value.includes("serif")) return "times";
  return "helvetica";
}

// Bold, Italic Font Style Mapping
function mapFontStyle(fontWeight: unknown, fontStyle: unknown) {
  const weightNumber = typeof fontWeight === "number" ? fontWeight : Number(fontWeight);
  const isBold = fontWeight === "bold" || Number.isFinite(weightNumber) && weightNumber >= 600;
  const isItalic = fontStyle === "italic";
  if (isBold && isItalic) return "bolditalic";
  if (isBold) return "bold";
  if (isItalic) return "italic";
  return "normal";
}

// Color Apply On Text 
function parseColor(fill: unknown) {
  if (typeof fill !== "string") return { r: 17, g: 24, b: 39 };
  const value = fill.trim().toLowerCase();

  if (value.startsWith("#")) {
    const hex = value.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16)
      };
    }
    if (hex.length >= 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16)
      };
    }
  }

  const rgbMatch = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return {
      r: Number(rgbMatch[1]),
      g: Number(rgbMatch[2]),
      b: Number(rgbMatch[3])
    };
  }

  return { r: 17, g: 24, b: 39 };
}

// Getting The Angle Of The Object
function getTextAngle(obj: fabric.Object) {
  const withTotalAngle = obj as fabric.Object & { getTotalAngle?: () => number };
  if (typeof withTotalAngle.getTotalAngle === "function") return withTotalAngle.getTotalAngle();
  return obj.angle || 0;
}

function isFiniteNumber(value: number) {
  return Number.isFinite(value) && !Number.isNaN(value);
}

function normalizeAngle(angle: number) {
  let value = angle % 360;
  if (value > 180) value -= 360;
  if (value < -180) value += 360;
  return value;
}

// Generating The First Page of Exported PDF
async function buildPdfCoverImage(logoUrl: string): Promise<string> {
  const el = document.createElement("canvas");
  const canvas = new fabric.StaticCanvas(el, {
    width: A4_PX.width,
    height: A4_PX.height,
    backgroundColor: "#ffffff"
  });

  await new Promise<void>((resolve) => {
    fabric.Image.fromURL(
      logoUrl,
      (img) => {
        if (img) {
          img.scaleToWidth(380);
          img.set({
            left: (canvas.getWidth() - img.getScaledWidth()) / 2,
            top: (canvas.getHeight() - img.getScaledHeight()) / 2
          });
          canvas.add(img);
        }
        resolve();
      },
      { crossOrigin: "anonymous" }
    );
  });

  canvas.renderAll();
  const data = canvas.toDataURL({ format: "jpeg", quality: EXPORT_COVER_QUALITY, multiplier: 1 });
  canvas.dispose();
  return data;
}

// Building The Header In Exported PDF
function buildHeaderParts(options: RenderImageOptions) {
  const separator = " - ";
  const headerText = options.headerText || "Modular Closets Renderings";
  const headerProjectName = options.headerProjectName || "";
  const headerCustomerName = options.headerCustomerName || "";

  return [
    { text: headerProjectName, fill: "#ea580c", fontStyle: "bold" as const },
    { text: separator, fill: "#64748b", fontStyle: "normal" as const },
    { text: headerText, fill: "#334155", fontStyle: "normal" as const },
    { text: separator, fill: "#64748b", fontStyle: "normal" as const },
    { text: headerCustomerName, fill: "#64748b", fontStyle: "normal" as const }
  ].filter((item) => item.text !== "");
}

// Selectable Text Of The Header In Exported PDF
function drawSelectableHeader(
  doc: jsPDF,
  options: RenderImageOptions,
  scaleY: number,
  renderingMode: "fill" | "invisible" = "fill"
) {
  const parts = buildHeaderParts(options);
  if (parts.length === 0) return;

  const fontSize = 16 * scaleY;
  const y = 18 * scaleY;

  let totalWidth = 0;
  parts.forEach((part) => {
    doc.setFont("helvetica", part.fontStyle);
    doc.setFontSize(fontSize);
    totalWidth += doc.getTextWidth(part.text);
  });

  let cursorX = (PDF_PAGE_WIDTH - totalWidth) / 2;
  parts.forEach((part) => {
    const color = parseColor(part.fill);
    doc.setFont("helvetica", part.fontStyle);
    doc.setFontSize(fontSize);
    doc.setTextColor(color.r, color.g, color.b);
    doc.text(part.text, cursorX, y, { baseline: "top", renderingMode });
    cursorX += doc.getTextWidth(part.text);
  });
}

// Rendering a Page As Image 
export async function renderPageToImage(page: Page, options: RenderImageOptions = {}): Promise<string> {
  const canvas = await buildCanvasForPage(page, options);
  const dataUrl = toDataUrl(canvas, options);
  canvas.dispose();
  return dataUrl;
}

// Converting The PDF From Pages
export async function exportPagesAsPdf(pages: Page[], options: ExportOptions = {}) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
    compress: true
  });

  let pageCount = 0;
  const scaleX = PDF_PAGE_WIDTH / A4_PX.width;
  const scaleY = PDF_PAGE_HEIGHT / A4_PX.height;
  const coverLogoUrl = options.footerLogoUrl || DEFAULT_FOOTER_LOGO_URL;
  const coverImage = await buildPdfCoverImage(coverLogoUrl);
  doc.addImage(coverImage, "JPEG", 0, 0, PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT, undefined, "MEDIUM");
  pageCount += 1;

  for (let i = 0; i < pages.length; i += 1) {
    const pageOptions: RenderImageOptions = {
      ...options,
      pageNumber: i + 1,
      totalPages: pages.length
    };

    const canvas = await buildCanvasForPage(pages[i], pageOptions);

    const textObjects = flattenObjects(canvas.getObjects())
      .filter((obj) => isFabricTextObject(obj))
      .filter((obj) => !obj.group)
      .map((obj) => obj as fabric.Text | fabric.IText | fabric.Textbox);

    const textOverlays: Array<{
      text: string;
      x: number;
      y: number;
      maxWidth?: number;
      angle: number;
      align: "left" | "center" | "right";
      fontSize: number;
      lineHeight: number;
      fontFamily: "helvetica" | "times" | "courier";
      fontStyle: "normal" | "bold" | "italic" | "bolditalic";
      color: { r: number; g: number; b: number };
      renderingMode: "fill" | "invisible";
    }> = [];
    const hideForRaster: fabric.Object[] = [];

    textObjects.forEach((obj) => {
      const text = (obj.text || "").trim();
      if (!text) return;
      const angle = normalizeAngle(getTextAngle(obj));
      const isRotated = Math.abs(angle) > 0.01;
      const align = obj.textAlign === "center" || obj.textAlign === "right" ? obj.textAlign : "left";
      const originX: "left" | "center" | "right" = align;
      const anchor = obj.getPointByOrigin(originX, "top");
      const x = anchor.x;
      const y = anchor.y;
      if (!isFiniteNumber(x) || !isFiniteNumber(y)) return;
      if (!isRotated) hideForRaster.push(obj);
      textOverlays.push({
        text: obj.text || "",
        x,
        y,
        maxWidth: !isRotated && obj.type === "textbox" ? obj.getScaledWidth() : undefined,
        angle,
        align,
        fontSize: (obj.fontSize || 16) * Math.abs(obj.scaleY || 1),
        lineHeight: obj.lineHeight || 1.16,
        fontFamily: mapFontFamily(obj.fontFamily),
        fontStyle: mapFontStyle(obj.fontWeight, obj.fontStyle),
        color: parseColor(obj.fill),
        renderingMode: isRotated ? "invisible" : "fill"
      });
    });

    const headerGroup = canvas.getObjects().find((obj) => obj.data?.id === HEADER_ID);
    if (headerGroup) headerGroup.set({ visible: false });
    hideForRaster.forEach((obj) => obj.set({ visible: false }));
    setWhiteBackground(canvas);
    canvas.renderAll();

    const pageData = toDataUrl(canvas, {
      ...pageOptions,
      format: "jpeg",
      multiplier: EXPORT_PAGE_MULTIPLIER,
      quality: EXPORT_PAGE_QUALITY
    });

    if (pageCount > 0) doc.addPage();
    doc.addImage(pageData, "JPEG", 0, 0, PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT, undefined, "SLOW");
    drawSelectableHeader(doc, pageOptions, scaleY, "fill");

    textOverlays.forEach((item) => {
      doc.setFont(item.fontFamily, item.fontStyle);
      doc.setFontSize(Math.max(6, item.fontSize * scaleY));
      doc.setLineHeightFactor(item.lineHeight);
      doc.setTextColor(item.color.r, item.color.g, item.color.b);

      const textOptions: {
        baseline: "top";
        align: "left" | "center" | "right";
        angle?: number;
        maxWidth?: number;
        renderingMode: "fill" | "invisible";
      } = {
        baseline: "top",
        align: item.align,
        renderingMode: item.renderingMode
      };

      if (Math.abs(item.angle) > 0.01) textOptions.angle = -item.angle;
      if (item.maxWidth && item.maxWidth > 0) textOptions.maxWidth = item.maxWidth * scaleX;
      doc.text(item.text, item.x * scaleX, item.y * scaleY, textOptions);
    });

    canvas.dispose();
    pageCount += 1;
  }

  doc.save(`proposal-${Date.now()}.pdf`);
}
