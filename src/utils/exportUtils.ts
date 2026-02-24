import { jsPDF } from "jspdf";
import { fabric } from "fabric";
import { A4_PX } from "@closet/core";
import type { Page } from "../state/builderStore";

export async function renderPageToImage(page: Page): Promise<string | null> {
  if (!page.fabricJSON) return null;
  const el = document.createElement("canvas");
  const canvas = new fabric.StaticCanvas(el, { width: A4_PX.width, height: A4_PX.height });
  return new Promise((resolve) => {
    canvas.loadFromJSON(page.fabricJSON, () => {
      canvas.renderAll();
      const dataUrl = canvas.toDataURL({ format: "png", multiplier: 2 });
      canvas.dispose();
      resolve(dataUrl);
    });
  });
}

export async function exportPagesAsPdf(pages: Page[]) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  let pageCount = 0;
  for (let i = 0; i < pages.length; i += 1) {
    const data = await renderPageToImage(pages[i]);
    if (!data) continue;
    if (pageCount > 0) doc.addPage();
    doc.addImage(data, "PNG", 0, 0, 595, 842, undefined, "FAST");
    pageCount += 1;
  }
  doc.save(`proposal-${Date.now()}.pdf`);
}

export async function exportPagesAsImages(pages: Page[]) {
  for (let i = 0; i < pages.length; i += 1) {
    const data = await renderPageToImage(pages[i]);
    if (!data) continue;
    const a = document.createElement("a");
    a.href = data;
    a.download = `${pages[i].name.toLowerCase().replace(/\\s+/g, "-")}.png`;
    a.click();
  }
}
