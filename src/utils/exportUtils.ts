import { jsPDF } from "jspdf";
import { fabric } from "fabric";
import { A4_PX } from "@closet/core";
import type { ExportOptions, Page, RenderImageOptions } from "../types";
import { applyPageDecorations } from "./pageDecorUtils";

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

function toDataUrl(canvas: fabric.StaticCanvas, options: RenderImageOptions) {
  const format = options.format ?? "png";
  const multiplier = options.multiplier ?? 2;
  const quality = options.quality ?? 0.9;
  return canvas.toDataURL({ format, multiplier, quality });
}

export async function renderPageToImage(page: Page, options: RenderImageOptions = {}): Promise<string> {
  const el = document.createElement("canvas");
  const canvas = new fabric.StaticCanvas(el, {
    width: A4_PX.width,
    height: A4_PX.height,
    backgroundColor: "#ffffff"
  });

  return new Promise((resolve) => {
    if (page.fabricJSON) {
      canvas.loadFromJSON(page.fabricJSON, () => {
        void applyPageDecorations(canvas, options).then(() => {
          canvas.renderAll();
          const dataUrl = toDataUrl(canvas, options);
          canvas.dispose();
          resolve(dataUrl);
        });
      });
      return;
    }

    if (page.defaultImageUrl) {
      fabric.Image.fromURL(
        page.defaultImageUrl,
        (img) => {
          if (img) {
            fitImageToPage(img, canvas);
            canvas.add(img);
          }
          void applyPageDecorations(canvas, options).then(() => {
            canvas.renderAll();
            const dataUrl = toDataUrl(canvas, options);
            canvas.dispose();
            resolve(dataUrl);
          });
        },
        { crossOrigin: "anonymous" }
      );
      return;
    }

    void applyPageDecorations(canvas, options).then(() => {
      canvas.renderAll();
      const dataUrl = toDataUrl(canvas, options);
      canvas.dispose();
      resolve(dataUrl);
    });
  });
}

export async function exportPagesAsPdf(pages: Page[], options: ExportOptions = {}) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
    compress: true
  });
  let pageCount = 0;
  for (let i = 0; i < pages.length; i += 1) {
    const data = await renderPageToImage(pages[i], {
      format: "jpeg",
      multiplier: 1.5,
      quality: 0.86,
      ...options,
      pageNumber: i + 1,
      totalPages: pages.length
    });
    if (!data) continue;
    if (pageCount > 0) doc.addPage();
    doc.addImage(data, "JPEG", 0, 0, 595, 842, undefined, "MEDIUM");
    pageCount += 1;
  }
  doc.save(`proposal-${Date.now()}.pdf`);
}

export async function exportPagesAsImages(pages: Page[], options: ExportOptions = {}) {
  for (let i = 0; i < pages.length; i += 1) {
    const data = await renderPageToImage(pages[i], {
      ...options,
      pageNumber: i + 1,
      totalPages: pages.length
    });
    if (!data) continue;
    const a = document.createElement("a");
    a.href = data;
    a.download = `${pages[i].name.toLowerCase().replace(/\\s+/g, "-")}.png`;
    a.click();
  }
}
