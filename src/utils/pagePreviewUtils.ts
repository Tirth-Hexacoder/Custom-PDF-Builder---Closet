import { A4_PX } from "@closet/core";
import { fabric } from "fabric";
import type { Page } from "../types";

const PREVIEW_TARGET_WIDTH = 180;
const PREVIEW_MULTIPLIER = PREVIEW_TARGET_WIDTH / A4_PX.width;

function setWhiteBackground(canvas: fabric.StaticCanvas) {
  canvas.setBackgroundColor("#ffffff", () => undefined);
}

function fitImageToPage(img: fabric.Image, canvas: fabric.StaticCanvas) {
  const margin = 40;
  const topMargin = 100;
  const bottomMargin = 70;
  const maxWidth = canvas.getWidth() - margin * 2;
  const maxHeight = canvas.getHeight() - topMargin - bottomMargin;
  const scaleX = maxWidth / (img.width || 1);
  const scaleY = maxHeight / (img.height || 1);
  const scale = Math.min(scaleX, scaleY, 1);
  img.scale(scale);
  img.set({
    left: (canvas.getWidth() - img.getScaledWidth()) / 2,
    top: topMargin + (maxHeight - img.getScaledHeight()) / 2
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
      setWhiteBackground(canvas);
    } else if (page.defaultImageUrl) {
      const defaultImageUrl = page.defaultImageUrl;
      await new Promise<void>((resolve) => {
        fabric.Image.fromURL(
          defaultImageUrl,
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
