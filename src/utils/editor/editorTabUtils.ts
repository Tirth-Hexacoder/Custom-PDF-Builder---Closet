import { A4_PX } from "@closet/core";
import type { Page } from "../../types";

export const MIN_ZOOM_PERCENT = 30;
export const MAX_ZOOM_PERCENT = 150;

// Collect all default image URLs attached to a page definition.
export function getPageDefaultImageUrls(page?: Page) {
  if (!page) return [] as string[];
  if (Array.isArray(page.defaultImages) && page.defaultImages.length > 0) {
    return page.defaultImages.map((item) => item.url).filter((url): url is string => !!url);
  }
  const url = page?.defaultImage?.url || page?.defaultImageUrl || "";
  return url ? [url] : [];
}

function getPageDefaultImageUrl(page?: Page) {
  return getPageDefaultImageUrls(page)[0] || "";
}

// Create a stable preview key so thumbnail regeneration only runs when page visuals change.
export function getPageDefaultImageKey(page?: Page) {
  if (!page) return "";
  const layout = page.defaultLayout || "";
  const images = Array.isArray(page.defaultImages) && page.defaultImages.length > 0
    ? page.defaultImages
    : (page.defaultImage?.url ? [page.defaultImage] : []);
  if (images.length > 0) {
    return JSON.stringify({
      layout,
      items: images.map((img) => ({
        url: img.url,
        notes: Array.isArray(img.notes)
          ? img.notes.map((note) => ({
            id: note.id,
            text: note.text,
            xPercent: note.xPercent,
            yPercent: note.yPercent,
            fontSize: note.fontSize,
            fontColor: note.fontColor,
            fontType: note.fontType
          }))
          : []
      }))
    });
  }
  return `${layout}|${getPageDefaultImageUrl(page)}`;
}

// Compute fit zoom by viewport target mode; keeps scaling logic reusable and testable.
export function computeFitZoom(mode: "width" | "height", viewport: HTMLDivElement | null) {
  if (!viewport) return 100;
  const availableWidth = Math.max(280, viewport.clientWidth - 96);
  const availableHeight = Math.max(280, viewport.clientHeight);
  const widthZoom = (availableWidth / A4_PX.width) * 100;
  const heightZoom = (availableHeight / A4_PX.height) * 100;
  return Math.max(MIN_ZOOM_PERCENT, Math.min(MAX_ZOOM_PERCENT, mode === "width" ? widthZoom : heightZoom));
}

export function clampZoom(next: number) {
  return Math.max(MIN_ZOOM_PERCENT, Math.min(MAX_ZOOM_PERCENT, Math.round(next)));
}

