import { jsPDF } from "jspdf";
import { fabric } from "fabric";
import { A4_PX } from "@closet/core";
import type { ExportOptions, Page, RenderImageOptions } from "../types";
import { applyPageDecorations, DEFAULT_FOOTER_LOGO_URL, HEADER_ID } from "./pageDecorUtils";

const PDF_PAGE_WIDTH = 595;
const PDF_PAGE_HEIGHT = 842;

function setWhiteBackground(canvas: fabric.StaticCanvas) {
  canvas.setBackgroundColor("#ffffff", () => undefined);
}

// Add Image and Fit Inside a Page
function fitImageToPage(img: fabric.Image, canvas: fabric.StaticCanvas) {
  const margin = 40;
  const topMargin = 100;
  const bottomMargin = 70;
  const maxWidth = canvas.getWidth() - margin * 2;
  const maxHeight = canvas.getHeight() - topMargin - bottomMargin;
  const imageWidth = img.width || 1;
  const imageHeight = img.height || 1;
  const scaleX = maxWidth / imageWidth;
  const scaleY = maxHeight / imageHeight;
  const scale = Math.min(scaleX, scaleY, 1);
  img.scale(scale);
  img.set({
    left: (canvas.getWidth() - img.getScaledWidth()) / 2,
    top: topMargin + (maxHeight - img.getScaledHeight()) / 2
  });
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

// Loads Data From Fabric JSON OR Adds Image To a Page
async function buildCanvasForPage(page: Page, options: RenderImageOptions) {
  const canvas = createExportCanvas();

  if (page.fabricJSON) {
    await new Promise<void>((resolve) => {
      canvas.loadFromJSON(page.fabricJSON, () => resolve());
    });
    setWhiteBackground(canvas);
  } else if (page.defaultImageUrl) {
    await new Promise<void>((resolve) => {
      fabric.Image.fromURL(
        page.defaultImageUrl!,
        (img) => {
          if (img) {
            fitImageToPage(img, canvas);
            canvas.add(img);
          }
          resolve();
        },
        { crossOrigin: "anonymous" }
      );
    });
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
  const data = canvas.toDataURL({ format: "jpeg", quality: 0.78, multiplier: 1 });
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
function drawSelectableHeader(doc: jsPDF, options: RenderImageOptions, scaleY: number) {
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
    doc.text(part.text, cursorX, y, { baseline: "top" });
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

    const overlayTargets = textObjects.filter((obj) => Math.abs(getTextAngle(obj)) <= 0.01);

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
    }> = [];

    overlayTargets.forEach((obj) => {
      const text = (obj.text || "").trim();
      if (!text) return;
      const bounds = obj.getBoundingRect(true, true);
      const align = obj.textAlign === "center" || obj.textAlign === "right" ? obj.textAlign : "left";
      const x = align === "center" ? bounds.left + bounds.width / 2 : align === "right" ? bounds.left + bounds.width : bounds.left;
      textOverlays.push({
        text: obj.text || "",
        x,
        y: bounds.top,
        maxWidth: obj.type === "textbox" ? obj.getScaledWidth() : undefined,
        angle: getTextAngle(obj),
        align,
        fontSize: (obj.fontSize || 16) * Math.abs(obj.scaleY || 1),
        lineHeight: obj.lineHeight || 1.16,
        fontFamily: mapFontFamily(obj.fontFamily),
        fontStyle: mapFontStyle(obj.fontWeight, obj.fontStyle),
        color: parseColor(obj.fill)
      });
    });

    const headerGroup = canvas.getObjects().find((obj) => obj.data?.id === HEADER_ID);
    if (headerGroup) headerGroup.set({ visible: false });
    overlayTargets.forEach((obj) => obj.set({ visible: false }));
    setWhiteBackground(canvas);
    canvas.renderAll();

    const pageData = toDataUrl(canvas, {
      ...pageOptions,
      format: "jpeg",
      multiplier: 1.5,
      quality: 0.86
    });

    if (pageCount > 0) doc.addPage();
    doc.addImage(pageData, "JPEG", 0, 0, PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT, undefined, "MEDIUM");
    drawSelectableHeader(doc, pageOptions, scaleY);

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
      } = {
        baseline: "top",
        align: item.align
      };

      if (Math.abs(item.angle) > 0.01) textOptions.angle = item.angle;
      if (item.maxWidth && item.maxWidth > 0) textOptions.maxWidth = item.maxWidth * scaleX;
      doc.text(item.text, item.x * scaleX, item.y * scaleY, textOptions);
    });

    canvas.dispose();
    pageCount += 1;
  }

  doc.save(`proposal-${Date.now()}.pdf`);
}
