import { fabric } from "fabric";

export type CropSide = "left" | "right" | "top" | "bottom";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// Cache original bitmap dimensions so crop and uncrop stay reversible.
export function ensureImageCropSourceSize(image: fabric.Image) {
  const data = (image.data || {}) as Record<string, unknown>;
  const element = image.getElement() as (HTMLImageElement & { naturalWidth?: number; naturalHeight?: number }) | null;
  const sourceWidth = typeof data.cropSourceWidth === "number"
    ? data.cropSourceWidth
    : element?.naturalWidth || image.width || 0;
  const sourceHeight = typeof data.cropSourceHeight === "number"
    ? data.cropSourceHeight
    : element?.naturalHeight || image.height || 0;

  image.set({
    data: {
      ...data,
      cropSourceWidth: sourceWidth,
      cropSourceHeight: sourceHeight
    }
  });

  return { sourceWidth, sourceHeight };
}

// Crop in object-local axes so handle drags work consistently at any rotation.
export function applyImageCropFromPointer(
  image: fabric.Image,
  pointer: { x: number; y: number },
  sides: CropSide[],
  minCropSize = 24
) {
  const { sourceWidth, sourceHeight } = ensureImageCropSourceSize(image);
  if (!sourceWidth || !sourceHeight) return false;

  const cropX = image.cropX || 0;
  const cropY = image.cropY || 0;
  const visibleWidth = image.width || sourceWidth;
  const visibleHeight = image.height || sourceHeight;
  const scaleX = Math.max(Math.abs(image.scaleX || 1), 0.0001);
  const scaleY = Math.max(Math.abs(image.scaleY || 1), 0.0001);
  const center = image.getCenterPoint();
  const angle = (image.angle || 0) * (Math.PI / 180);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const axisX = { x: cos, y: sin };
  const axisY = { x: -sin, y: cos };
  const vectorToPointer = { x: pointer.x - center.x, y: pointer.y - center.y };
  const halfWidthOnCanvas = (visibleWidth * scaleX) / 2;
  const halfHeightOnCanvas = (visibleHeight * scaleY) / 2;
  const projectedX = vectorToPointer.x * axisX.x + vectorToPointer.y * axisX.y;
  const projectedY = vectorToPointer.x * axisY.x + vectorToPointer.y * axisY.y;
  const pointerFromLeftRaw = (projectedX + halfWidthOnCanvas) / scaleX;
  const pointerFromTopRaw = (projectedY + halfHeightOnCanvas) / scaleY;

  let nextCropX = cropX;
  let nextCropY = cropY;
  let nextWidth = visibleWidth;
  let nextHeight = visibleHeight;

  if (sides.includes("right")) {
    nextWidth = clamp(pointerFromLeftRaw, minCropSize, sourceWidth - nextCropX);
  }
  if (sides.includes("left")) {
    const sourceRight = cropX + visibleWidth;
    const desiredWidth = clamp(visibleWidth - pointerFromLeftRaw, minCropSize, sourceRight);
    nextCropX = clamp(sourceRight - desiredWidth, 0, sourceWidth - minCropSize);
    nextWidth = clamp(sourceRight - nextCropX, minCropSize, sourceWidth - nextCropX);
  }
  if (sides.includes("bottom")) {
    nextHeight = clamp(pointerFromTopRaw, minCropSize, sourceHeight - nextCropY);
  }
  if (sides.includes("top")) {
    const sourceBottom = cropY + visibleHeight;
    const desiredHeight = clamp(visibleHeight - pointerFromTopRaw, minCropSize, sourceBottom);
    nextCropY = clamp(sourceBottom - desiredHeight, 0, sourceHeight - minCropSize);
    nextHeight = clamp(sourceBottom - nextCropY, minCropSize, sourceHeight - nextCropY);
  }

  const preserveRight = sides.includes("left") && !sides.includes("right");
  const preserveLeft = sides.includes("right") && !sides.includes("left");
  const preserveBottom = sides.includes("top") && !sides.includes("bottom");
  const preserveTop = sides.includes("bottom") && !sides.includes("top");
  const originX: "left" | "center" | "right" = preserveRight ? "right" : preserveLeft ? "left" : "center";
  const originY: "top" | "center" | "bottom" = preserveBottom ? "bottom" : preserveTop ? "top" : "center";
  const anchor = image.getPointByOrigin(originX, originY);

  image.set({
    cropX: nextCropX,
    cropY: nextCropY,
    width: nextWidth,
    height: nextHeight
  });
  image.setPositionByOrigin(anchor, originX, originY);
  image.setCoords();
  image.dirty = true;
  image.canvas?.requestRenderAll();
  return true;
}

// Use Fabric's native cursor resolver so crop cursors match default resize behavior.
export function resolveCropCursorStyle(
  controlKey: "tl" | "tr" | "bl" | "br" | "ml" | "mr" | "mt" | "mb",
  fallbackCursor: string,
  eventData: MouseEvent,
  control: fabric.Control,
  target: fabric.Object
) {
  const defaultControl = fabric.Object.prototype.controls?.[controlKey];
  if (!defaultControl?.cursorStyleHandler) return fallbackCursor;
  return defaultControl.cursorStyleHandler(eventData, control, target);
}
