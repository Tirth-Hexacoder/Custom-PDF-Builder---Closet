import { A4_PX } from "@closet/core";
import { fabric } from "fabric";
import type { CreateCanvasOptions, FabricCanvasHandle, FabricJSON, Page } from "../types";
import { applyPageDecorations, bringDecorationsToFront, isDecorationId, isLockedDecorationId } from "./pageDecorUtils";

const GUIDE_SNAP_THRESHOLD = 6;
const MIN_IMAGE_CROP_SIZE = 24;
const BOM_TABLE_GROUP_ID = "bom-table-group";
type FabricTextObject = fabric.Text | fabric.IText | fabric.Textbox;
type CanvasWithTopContext = fabric.Canvas & { contextTop?: CanvasRenderingContext2D | null };

// If the Fabric Object is Type of Text
function isTextObject(obj: fabric.Object | null | undefined): obj is FabricTextObject {
  return !!obj && typeof obj.type === "string" && ["i-text", "textbox", "text"].includes(obj.type);
}

function isEditingTextObject(obj: fabric.Object | null | undefined): obj is fabric.IText | fabric.Textbox {
  return isTextObject(obj) && "isEditing" in obj;
}

// If the Fabric Object is BOM Object
function isBomObject(obj: fabric.Object | null | undefined) {
  const id = obj?.data?.id;
  return typeof id === "string" && id.startsWith("bom-");
}

function isBomTablePart(obj: fabric.Object | null | undefined) {
  const id = obj?.data?.id;
  return typeof id === "string" && id.startsWith("bom-") && id !== BOM_TABLE_GROUP_ID;
}

function isImageObject(obj: fabric.Object | null | undefined): obj is fabric.Image {
  return !!obj && obj.type === "image";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function ensureImageCropSourceSize(image: fabric.Image) {
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

type CropSide = "left" | "right" | "top" | "bottom";

function applyImageCropFromPointer(image: fabric.Image, pointer: { x: number; y: number }, side: CropSide) {
  if (Math.abs(image.angle || 0) > 0.01) return false;
  const { sourceWidth, sourceHeight } = ensureImageCropSourceSize(image);
  if (!sourceWidth || !sourceHeight) return false;

  const scaleX = Math.abs(image.scaleX || 1);
  const scaleY = Math.abs(image.scaleY || 1);
  const cropX = image.cropX || 0;
  const cropY = image.cropY || 0;
  const visibleWidth = image.width || sourceWidth;
  const visibleHeight = image.height || sourceHeight;
  const left = image.left || 0;
  const top = image.top || 0;
  const right = left + visibleWidth * scaleX;
  const bottom = top + visibleHeight * scaleY;

  if (side === "right") {
    const nextWidth = clamp((pointer.x - left) / scaleX, MIN_IMAGE_CROP_SIZE, sourceWidth - cropX);
    image.set({ width: nextWidth });
  } else if (side === "left") {
    const sourceRight = cropX + visibleWidth;
    const desiredWidth = clamp((right - pointer.x) / scaleX, MIN_IMAGE_CROP_SIZE, sourceRight);
    const nextCropX = clamp(sourceRight - desiredWidth, 0, sourceWidth - MIN_IMAGE_CROP_SIZE);
    const nextWidth = clamp(sourceRight - nextCropX, MIN_IMAGE_CROP_SIZE, sourceWidth - nextCropX);
    image.set({
      cropX: nextCropX,
      width: nextWidth,
      left: right - nextWidth * scaleX
    });
  } else if (side === "bottom") {
    const nextHeight = clamp((pointer.y - top) / scaleY, MIN_IMAGE_CROP_SIZE, sourceHeight - cropY);
    image.set({ height: nextHeight });
  } else {
    const sourceBottom = cropY + visibleHeight;
    const desiredHeight = clamp((bottom - pointer.y) / scaleY, MIN_IMAGE_CROP_SIZE, sourceBottom);
    const nextCropY = clamp(sourceBottom - desiredHeight, 0, sourceHeight - MIN_IMAGE_CROP_SIZE);
    const nextHeight = clamp(sourceBottom - nextCropY, MIN_IMAGE_CROP_SIZE, sourceHeight - nextCropY);
    image.set({
      cropY: nextCropY,
      height: nextHeight,
      top: bottom - nextHeight * scaleY
    });
  }

  image.setCoords();
  image.dirty = true;
  image.canvas?.requestRenderAll();
  return true;
}

// Rotation Icon Addition
function getRotationGlyph() {
  if (typeof document === "undefined") return null;
  const el = document.createElement("i");
  el.className = "fa-solid fa-rotate-right";
  el.style.position = "absolute";
  el.style.left = "-9999px";
  el.style.fontSize = "16px";
  document.body.appendChild(el);
  const content = getComputedStyle(el, "::before").getPropertyValue("content");
  document.body.removeChild(el);
  if (!content || content === "none") return null;
  const cleaned = content.replace(/['"]/g, "");
  if (cleaned.startsWith("\\")) {
    const code = cleaned.replace("\\", "");
    return String.fromCharCode(parseInt(code, 16));
  }
  return cleaned;
}

// Create The Canvas (Page) -- Actual
export function createPageCanvas(options: CreateCanvasOptions) {
  // Pull editor callbacks + page decoration inputs from the component layer.
  const {
    host,
    page,
    onPageChange,
    onReady,
    headerText: headerTextInput,
    headerProjectName: headerProjectNameInput,
    headerCustomerName: headerCustomerNameInput,
    footerLogoUrl: footerLogoUrlInput,
    pageNumber: pageNumberInput,
    totalPages: totalPagesInput,
    designerEmail: designerEmailInput,
    designerMobile: designerMobileInput
  } = options;

  let headerText = headerTextInput || "Modular Closets Renderings";
  let headerProjectName = headerProjectNameInput || "";
  let headerCustomerName = headerCustomerNameInput || "";
  let footerLogoUrl = footerLogoUrlInput;
  let pageNumber = pageNumberInput;
  let totalPages = totalPagesInput;
  let designerEmail = designerEmailInput;
  let designerMobile = designerMobileInput;

  let onPageChangeRef = onPageChange;
  let onReadyRef = onReady;
  let onTextSelectionChangeRef = options.onTextSelectionChange;

  // Interactive Fabric canvas used by EditorTab for per-page editing.
  const canvas = new fabric.Canvas(host, {
    width: A4_PX.width,
    height: A4_PX.height,
    backgroundColor: "#ffffff",
    preserveObjectStacking: true,
    selection: true,
    selectionColor: "rgba(37, 99, 235, 0.1)",
    selectionBorderColor: "#2563eb",
    selectionLineWidth: 1
  });

  fabric.Object.prototype.transparentCorners = false;
  fabric.Object.prototype.cornerColor = "#2563eb";
  fabric.Object.prototype.cornerStyle = "circle";
  fabric.Object.prototype.cornerSize = 8;
  fabric.Object.prototype.borderColor = "#2563eb";
  fabric.Object.prototype.padding = 4;

  const renderRotationIcon = (
    ctx: CanvasRenderingContext2D,
    left: number,
    top: number,
    _styleOverride: Record<string, unknown>,
    fabricObject: fabric.Object
  ) => {
    const glyph = getRotationGlyph();
    const centerX = left;
    const centerY = top;
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate((fabricObject.angle || 0) * (Math.PI / 180));
    if (glyph) {
      ctx.fillStyle = "#f97316";
      ctx.font = "900 16px \"Font Awesome 6 Free\"";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(glyph, 0, 0);
    }
    ctx.restore();
  };

  if (fabric.Object.prototype.controls?.mtr) {
    fabric.Object.prototype.controls.mtr.render = renderRotationIcon;
    fabric.Object.prototype.controls.mtr.sizeX = 24;
    fabric.Object.prototype.controls.mtr.sizeY = 24;
    (fabric.Object.prototype.controls.mtr as { withConnection?: boolean }).withConnection = false;
    (fabric.Object.prototype.controls.mtr as { offsetY?: number }).offsetY = -15;
  }
  (fabric.Object.prototype as { rotatingPointOffset?: number }).rotatingPointOffset = 2;

  canvas.setZoom(1);
  canvas.setWidth(A4_PX.width);
  canvas.setHeight(A4_PX.height);

  const createImageCropControl = (side: CropSide, x: number, y: number, cursorStyle: string) =>
    new fabric.Control({
      x,
      y,
      cursorStyle,
      actionName: "crop",
      actionHandler: (eventData, transform) => {
        const target = transform.target;
        if (!isImageObject(target) || !target.canvas) return false;
        const pointer = target.canvas.getPointer(eventData as MouseEvent);
        return applyImageCropFromPointer(target, pointer, side);
      }
    });

  const applyImageControls = (obj: fabric.Object | null | undefined) => {
    if (!isImageObject(obj)) return;
    ensureImageCropSourceSize(obj);
    obj.controls = {
      ...fabric.Object.prototype.controls,
      ml: createImageCropControl("left", -0.5, 0, "ew-resize"),
      mr: createImageCropControl("right", 0.5, 0, "ew-resize"),
      mt: createImageCropControl("top", 0, -0.5, "ns-resize"),
      mb: createImageCropControl("bottom", 0, 0.5, "ns-resize")
    };
  };

  const applyImageControlsToCanvas = () => {
    canvas.getObjects().forEach((obj) => applyImageControls(obj));
  };

  const applyBomGroupBehavior = (obj: fabric.Object) => {
    obj.set({
      selectable: true,
      evented: true,
      hasControls: false,
      hasBorders: true,
      lockMovementX: false,
      lockMovementY: false,
      lockScalingX: true,
      lockScalingY: true,
      lockRotation: true,
      lockSkewingX: true,
      lockSkewingY: true,
      hoverCursor: "move",
      moveCursor: "move",
      data: { ...(obj.data || {}), id: BOM_TABLE_GROUP_ID }
    });
  };

  const ensureBomTableGroup = () => {
    const existingGroup = canvas.getObjects().find((obj) => obj.data?.id === BOM_TABLE_GROUP_ID);
    if (existingGroup) {
      applyBomGroupBehavior(existingGroup);
      existingGroup.setCoords();
      return;
    }

    const bomParts = canvas.getObjects().filter((obj) => isBomTablePart(obj));
    if (bomParts.length === 0) return;

    const group = new fabric.Group(bomParts);
    bomParts.forEach((obj) => canvas.remove(obj));
    applyBomGroupBehavior(group);
    canvas.add(group);
    group.setCoords();
  };

  let clipboard: fabric.Object | null = null;
  let history: string[] = [];
  let historyIndex = -1;
  let hasPageChanges = false;
  let isRestoring = false;
  let isApplyingDecorations = false;
  let decorVersion = 0;
  let currentPageId: string | null = page?.id ?? null;
  let isDisposed = false;
  let textChangeTimer: number | null = null;

  // Visual helper states used while moving/rotating objects.
  let guideState = {
    active: false,
    bounds: null as null | {
      left: number;
      right: number;
      top: number;
      bottom: number;
      width: number;
      height: number;
      centerX: number;
      centerY: number;
    },
    showCenterX: false,
    showCenterY: false
  };

  let alignGuideState = { x: null as number | null, y: null as number | null };

  let rotationGuideState = {
    active: false,
    angle: 0,
    point: null as null | { x: number; y: number }
  };

  function normalizeTextStylesForSerialization() {
    // Ensure text styles are always object-shaped so Fabric JSON stays stable.
    const visit = (obj: fabric.Object) => {
      if (obj.type === "group") {
        const children = (obj as fabric.Group).getObjects() as fabric.Object[];
        children.forEach((child) => visit(child));
      }

      if (obj.type === "text" || obj.type === "i-text" || obj.type === "textbox") {
        const textObj = obj as fabric.Textbox & { styles?: Record<string, unknown> };
        if (!textObj.styles || typeof textObj.styles !== "object") {
          textObj.styles = {};
        }
      }
    };

    canvas.getObjects().forEach((obj) => visit(obj));
  }

  function buildPersistedJson() {
    normalizeTextStylesForSerialization();
    const raw = canvas.toJSON(["data"]) as unknown as { objects?: fabric.Object[] } & Record<string, unknown>;
    const objects = Array.isArray(raw.objects)
      ? raw.objects.filter((obj) => !isLockedDecorationId(obj?.data?.id))
      : [];
    return {
      ...raw,
      objects
    };
  }

  function seedHistoryFromCanvas() {
    // First history snapshot after a page is loaded or initialized.
    const json = JSON.stringify(buildPersistedJson());
    history = [json];
    historyIndex = 0;
    hasPageChanges = false;
  }

  function pushHistory() {
    // Persist canvas snapshot and sync it back to store via onPageChange.
    if (isRestoring || isDisposed) return;
    if (!currentPageId) return;
    const json = JSON.stringify(buildPersistedJson());
    const latest = history[historyIndex];
    if (latest === json) return;
    const list = history.slice(0, historyIndex + 1);
    list.push(json);
    history = list.slice(-50);
    historyIndex = history.length - 1;
    hasPageChanges = true;
    onPageChangeRef(currentPageId, JSON.parse(json));
  }

  function toToolbarState(obj: fabric.Object | null | undefined) {
    if (!isTextObject(obj) || isBomObject(obj)) {
      return { bold: false, italic: false, underline: false, align: "left" as const };
    }
    const textObj = obj as FabricTextObject;
    const align: "left" | "center" | "right" =
      textObj.textAlign === "center" || textObj.textAlign === "right" ? textObj.textAlign : "left";
    return {
      bold: textObj.fontWeight === "bold" || Number(textObj.fontWeight) >= 600,
      italic: textObj.fontStyle === "italic",
      underline: !!textObj.underline,
      align
    };
  }

  function emitSelectionStyle() {
    if (!onTextSelectionChangeRef) return;
    const active = canvas.getActiveObject();
    if (active?.type === "activeSelection") {
      const selection = active as fabric.ActiveSelection;
      const textTarget = selection.getObjects().find((obj) => isTextObject(obj) && !isBomObject(obj));
      onTextSelectionChangeRef(toToolbarState(textTarget ?? null));
      return;
    }
    onTextSelectionChangeRef(toToolbarState(active));
  }

  function ensureHeaderFooter() {
    // Reapply fixed decorations after edits/page changes with stale-call protection.
    if (isDisposed) return;
    decorVersion += 1;
    const requestVersion = decorVersion;
    isApplyingDecorations = true;
    void applyPageDecorations(canvas, {
      headerText,
      headerProjectName,
      headerCustomerName,
      footerLogoUrl,
      isActive: () => !isDisposed && requestVersion === decorVersion,
      pageNumber,
      totalPages,
      designerEmail,
      designerMobile
    }).finally(() => {
      if (requestVersion !== decorVersion) return;
      isApplyingDecorations = false;
      if (!isDisposed) {
        bringDecorationsToFront(canvas);
        canvas.requestRenderAll();
      }
    });
  }

  function addDefaultImage(url: string, opts?: { recordHistory?: boolean; onComplete?: () => void }) {
    // Auto-place a default scene image inside printable content area.
    fabric.Image.fromURL(
      url,
      (img) => {
        if (!img || isDisposed) return;
        const margin = 40;
        const topMargin = 100;
        const bottomMargin = 70;
        const maxWidth = canvas.getWidth() - margin * 2;
        const maxHeight = canvas.getHeight() - topMargin - bottomMargin;
        const scaleX = maxWidth / img.width!;
        const scaleY = maxHeight / img.height!;
        const scale = Math.min(scaleX, scaleY, 1);
        img.scale(scale);
        img.set({
          left: (canvas.getWidth() - img.getScaledWidth()) / 2,
          top: topMargin + (maxHeight - img.getScaledHeight()) / 2
        });
        applyImageControls(img);
        canvas.add(img);
        canvas.setActiveObject(img);
        ensureHeaderFooter();
        if (!isDisposed) canvas.requestRenderAll();
        if (opts?.recordHistory !== false) pushHistory();
        opts?.onComplete?.();
      },
      { crossOrigin: "anonymous" }
    );
  }

  function loadPage(nextPage?: Page) {
    // Switch canvas state to another page and rebuild history/decorations.
    if (!nextPage || isDisposed) return;
    if (nextPage.id === currentPageId) return;
    currentPageId = nextPage.id;
    isRestoring = true;
    canvas.clear();
    canvas.setBackgroundColor("#fff", canvas.renderAll.bind(canvas));
    if (nextPage.fabricJSON) {
      canvas.loadFromJSON(nextPage.fabricJSON, () => {
        applyImageControlsToCanvas();
        ensureBomTableGroup();
        isRestoring = false;
        ensureHeaderFooter();
        canvas.renderAll();
        seedHistoryFromCanvas();
        emitSelectionStyle();
      });
    } else {
      isRestoring = false;
      ensureHeaderFooter();
      if (nextPage.defaultImageUrl) {
        addDefaultImage(nextPage.defaultImageUrl, {
          recordHistory: false,
          onComplete: () => {
            seedHistoryFromCanvas();
            emitSelectionStyle();
          }
        });
        return;
      }
      canvas.renderAll();
      seedHistoryFromCanvas();
      emitSelectionStyle();
    }
  }

  function onDeleteKey(event: KeyboardEvent) {
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    const target = event.target as HTMLElement | null;
    const targetTag = target?.tagName?.toLowerCase();
    const isTypingField =
      target?.isContentEditable ||
      targetTag === "input" ||
      targetTag === "textarea" ||
      targetTag === "select";
    const active = canvas.getActiveObject();
    if (isTypingField || (isEditingTextObject(active) && active.isEditing)) return;
    removeActiveObjects();
  }

  function onClipboardShortcuts(event: KeyboardEvent) {
    const isMac = navigator.platform.toLowerCase().includes("mac");
    const modKey = isMac ? event.metaKey : event.ctrlKey;
    if (!modKey) return;
    const key = event.key.toLowerCase();
    const target = event.target as HTMLElement | null;
    const targetTag = target?.tagName?.toLowerCase();
    const isTypingField =
      target?.isContentEditable ||
      targetTag === "input" ||
      targetTag === "textarea" ||
      targetTag === "select";
    const active = canvas.getActiveObject();
    if (isTypingField || (isEditingTextObject(active) && active.isEditing)) return;

    if (key === "c") {
      event.preventDefault();
      clipboard = null;
      const activeObj = canvas.getActiveObject();
      if (isDecorationId(activeObj?.data?.id)) return;
      if (isBomObject(activeObj)) return;
      if (activeObj) {
        activeObj.clone((cloned: fabric.Object) => {
          clipboard = cloned;
        });
      }
    }

    if (key === "x") {
      event.preventDefault();
      const activeObj = canvas.getActiveObject();
      if (isDecorationId(activeObj?.data?.id)) return;
      if (isBomObject(activeObj)) return;
      if (activeObj) {
        activeObj.clone((cloned: fabric.Object) => {
          clipboard = cloned;
          removeActiveObjects();
        });
      }
    }

    if (key === "v") {
      event.preventDefault();
      if (!clipboard) return;
      clipboard.clone((clonedObj: fabric.Object) => {
        canvas.discardActiveObject();
        clonedObj.set({ left: (clonedObj.left || 0) + 12, top: (clonedObj.top || 0) + 12, evented: true });
        if (clonedObj.type === "activeSelection") {
          const selection = clonedObj as fabric.ActiveSelection;
          selection.canvas = canvas;
          selection.forEachObject((obj: fabric.Object) => canvas.add(obj));
          clonedObj.setCoords();
        } else {
          canvas.add(clonedObj);
        }
        clipboard = clonedObj;
        canvas.setActiveObject(clonedObj);
        canvas.requestRenderAll();
        pushHistory();
      });
    }
  }

  function removeActiveObjects() {
    const activeObjects = canvas.getActiveObjects();
    if (activeObjects.length > 0) {
      canvas.discardActiveObject();
      let removed = false;
      activeObjects.forEach((obj) => {
        if (isDecorationId(obj.data?.id)) return;
        if (isBomObject(obj)) return;
        canvas.remove(obj);
        removed = true;
      });
      if (removed) {
        canvas.requestRenderAll();
        pushHistory();
      }
      return;
    }
    const activeObject = canvas.getActiveObject();
    if (activeObject && !isDecorationId(activeObject.data?.id) && !isBomObject(activeObject)) {
      canvas.discardActiveObject();
      canvas.remove(activeObject);
      canvas.requestRenderAll();
      pushHistory();
    }
  }

  function moveLayer(direction: "up" | "down") {
    const activeObjects = canvas.getActiveObjects();
    const targets = activeObjects.length > 0
      ? activeObjects
      : [canvas.getActiveObject()].filter(Boolean) as fabric.Object[];
    if (targets.length === 0) return;

    let changed = false;
    targets.forEach((obj) => {
      if (isLockedDecorationId(obj.data?.id)) return;
      if (direction === "up") {
        canvas.bringForward(obj);
      } else {
        canvas.sendBackwards(obj);
      }
      changed = true;
    });

    if (!changed) return;
    bringDecorationsToFront(canvas);
    canvas.requestRenderAll();
    pushHistory();
  }

  function clearGuides() {
    guideState = { active: false, bounds: null, showCenterX: false, showCenterY: false };
    rotationGuideState = { active: false, angle: 0, point: null };
    alignGuideState = { x: null, y: null };
    if (!isDisposed) canvas.requestRenderAll();
  }

  function onMouseUp() {
    clearGuides();
    pushHistory();
  }

  function clearGuideLayer() {
    const ctx = (canvas as CanvasWithTopContext).contextTop;
    if (!ctx) return;
    canvas.clearContext(ctx);
  }

  function renderGuides() {
    const ctx = (canvas as CanvasWithTopContext).contextTop;
    if (!ctx) return;

    const shouldRenderGuides = guideState.active && guideState.bounds;
    const shouldRenderRotation = rotationGuideState.active && rotationGuideState.point;
    if (!shouldRenderGuides && !shouldRenderRotation && !alignGuideState.x && !alignGuideState.y) return;

    const pageWidth = canvas.getWidth();
    const pageHeight = canvas.getHeight();

    const lineColor = "#2563eb";
    const accentColor = "#0f172a";
    const labelBg = "rgba(255, 255, 255, 0.9)";

    const drawLabel = (text: string, x: number, y: number) => {
      ctx.save();
      ctx.font = "12px \"Segoe UI\", \"Helvetica Neue\", Arial, sans-serif";
      ctx.fillStyle = labelBg;
      const paddingX = 6;
      const paddingY = 3;
      const metrics = ctx.measureText(text);
      const width = metrics.width + paddingX * 2;
      const height = 16 + paddingY * 2;
      ctx.fillRect(x - width / 2, y - height / 2, width, height);
      ctx.fillStyle = accentColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x, y);
      ctx.restore();
    };

    const drawMeasureLine = (x1: number, y1: number, x2: number, y2: number, label: string) => {
      ctx.save();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);

      const tickSize = 6;
      if (y1 === y2) {
        ctx.beginPath();
        ctx.moveTo(x1, y1 - tickSize);
        ctx.lineTo(x1, y1 + tickSize);
        ctx.moveTo(x2, y2 - tickSize);
        ctx.lineTo(x2, y2 + tickSize);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(x1 - tickSize, y1);
        ctx.lineTo(x1 + tickSize, y1);
        ctx.moveTo(x2 - tickSize, y2);
        ctx.lineTo(x2 + tickSize, y2);
        ctx.stroke();
      }

      drawLabel(label, (x1 + x2) / 2, (y1 + y2) / 2);
      ctx.restore();
    };

    const suppressMeasurements = alignGuideState.x !== null || alignGuideState.y !== null;
    if (shouldRenderGuides && guideState.bounds && !suppressMeasurements) {
      const { bounds, showCenterX, showCenterY } = guideState;
      const leftDistance = Math.max(0, Math.round(bounds.left));
      const rightDistance = Math.max(0, Math.round(pageWidth - bounds.right));
      const topDistance = Math.max(0, Math.round(bounds.top));
      const bottomDistance = Math.max(0, Math.round(pageHeight - bounds.bottom));

      drawMeasureLine(0, bounds.centerY, bounds.left, bounds.centerY, `${leftDistance}px`);
      drawMeasureLine(bounds.right, bounds.centerY, pageWidth, bounds.centerY, `${rightDistance}px`);
      drawMeasureLine(bounds.centerX, 0, bounds.centerX, bounds.top, `${topDistance}px`);
      drawMeasureLine(bounds.centerX, bounds.bottom, bounds.centerX, pageHeight, `${bottomDistance}px`);

      ctx.save();
      ctx.strokeStyle = "#f97316";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      if (showCenterX) {
        ctx.beginPath();
        ctx.moveTo(pageWidth / 2, 0);
        ctx.lineTo(pageWidth / 2, pageHeight);
        ctx.stroke();
      }
      if (showCenterY) {
        ctx.beginPath();
        ctx.moveTo(0, pageHeight / 2);
        ctx.lineTo(pageWidth, pageHeight / 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (shouldRenderRotation && rotationGuideState.point) {
      const { angle, point } = rotationGuideState;
      const normalized = ((Math.round(angle) % 360) + 360) % 360;
      drawLabel(`${normalized}\u00b0`, point.x, point.y - 18);
    }

    if (alignGuideState.x !== null || alignGuideState.y !== null) {
      ctx.save();
      ctx.strokeStyle = "#16a34a";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      if (alignGuideState.x !== null) {
        ctx.beginPath();
        ctx.moveTo(alignGuideState.x, 0);
        ctx.lineTo(alignGuideState.x, pageHeight);
        ctx.stroke();
      }
      if (alignGuideState.y !== null) {
        ctx.beginPath();
        ctx.moveTo(0, alignGuideState.y);
        ctx.lineTo(pageWidth, alignGuideState.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function onObjectMoving(event: fabric.IEvent) {
    const target = event.target as fabric.Object | undefined;
    if (!target) return;

    const pageWidth = canvas.getWidth();
    const pageHeight = canvas.getHeight();
    const center = target.getCenterPoint();
    const pageCenterX = pageWidth / 2;
    const pageCenterY = pageHeight / 2;

    let centerSnappedX = false;
    let centerSnappedY = false;
    let alignX: number | null = null;
    let alignY: number | null = null;

    const otherObjects = canvas
      .getObjects()
      .filter((obj) => obj !== target && !isDecorationId(obj.data?.id));

    const bounds = target.getBoundingRect(true, true);
    const targetLeft = bounds.left;
    const targetRight = bounds.left + bounds.width;
    const targetTop = bounds.top;
    const targetBottom = bounds.top + bounds.height;
    const targetCenterX = bounds.left + bounds.width / 2;
    const targetCenterY = bounds.top + bounds.height / 2;

    let bestDx = GUIDE_SNAP_THRESHOLD + 1;
    let bestDy = GUIDE_SNAP_THRESHOLD + 1;

    otherObjects.forEach((obj) => {
      const b = obj.getBoundingRect(true, true);
      const objLeft = b.left;
      const objRight = b.left + b.width;
      const objTop = b.top;
      const objBottom = b.top + b.height;
      const objCenterX = b.left + b.width / 2;
      const objCenterY = b.top + b.height / 2;

      const xCandidates = [
        { value: objLeft, targetValue: targetLeft },
        { value: objRight, targetValue: targetRight },
        { value: objCenterX, targetValue: targetCenterX }
      ];
      xCandidates.forEach(({ value, targetValue }) => {
        const delta = value - targetValue;
        if (Math.abs(delta) < Math.abs(bestDx)) {
          bestDx = delta;
          alignX = value;
        }
      });

      const yCandidates = [
        { value: objTop, targetValue: targetTop },
        { value: objBottom, targetValue: targetBottom },
        { value: objCenterY, targetValue: targetCenterY }
      ];
      yCandidates.forEach(({ value, targetValue }) => {
        const delta = value - targetValue;
        if (Math.abs(delta) < Math.abs(bestDy)) {
          bestDy = delta;
          alignY = value;
        }
      });
    });

    if (Math.abs(bestDx) <= GUIDE_SNAP_THRESHOLD) {
      target.set({ left: (target.left ?? 0) + bestDx });
    } else {
      alignX = Math.abs(bestDx) <= GUIDE_SNAP_THRESHOLD * 1.5 ? alignX : null;
    }

    if (Math.abs(bestDy) <= GUIDE_SNAP_THRESHOLD) {
      target.set({ top: (target.top ?? 0) + bestDy });
    } else {
      alignY = Math.abs(bestDy) <= GUIDE_SNAP_THRESHOLD * 1.5 ? alignY : null;
    }

    const newCenter = target.getCenterPoint();
    if (Math.abs(newCenter.x - pageCenterX) <= GUIDE_SNAP_THRESHOLD) {
      target.setPositionByOrigin(new fabric.Point(pageCenterX, center.y), "center", "center");
      centerSnappedX = true;
    }
    if (Math.abs(newCenter.y - pageCenterY) <= GUIDE_SNAP_THRESHOLD) {
      const updatedCenter = target.getCenterPoint();
      target.setPositionByOrigin(new fabric.Point(updatedCenter.x, pageCenterY), "center", "center");
      centerSnappedY = true;
    }

    const constrained = target.getBoundingRect(true, true);
    let offsetX = 0;
    let offsetY = 0;
    if (constrained.left < 0) offsetX = -constrained.left;
    if (constrained.left + constrained.width > pageWidth) {
      offsetX = Math.min(offsetX, 0) + (pageWidth - (constrained.left + constrained.width));
    }
    if (constrained.top < 0) offsetY = -constrained.top;
    if (constrained.top + constrained.height > pageHeight) {
      offsetY = Math.min(offsetY, 0) + (pageHeight - (constrained.top + constrained.height));
    }
    if (offsetX !== 0 || offsetY !== 0) {
      target.set({
        left: (target.left ?? 0) + offsetX,
        top: (target.top ?? 0) + offsetY
      });
    }

    target.setCoords();

    const updatedBounds = target.getBoundingRect(true, true);
    guideState = {
      active: true,
      bounds: {
        left: updatedBounds.left,
        right: updatedBounds.left + updatedBounds.width,
        top: updatedBounds.top,
        bottom: updatedBounds.top + updatedBounds.height,
        width: updatedBounds.width,
        height: updatedBounds.height,
        centerX: updatedBounds.left + updatedBounds.width / 2,
        centerY: updatedBounds.top + updatedBounds.height / 2
      },
      showCenterX: centerSnappedX,
      showCenterY: centerSnappedY
    };

    alignGuideState = { x: alignX, y: alignY };

    canvas.requestRenderAll();
  }

  function onObjectRotating(event: fabric.IEvent) {
    const target = event.target as fabric.Object | undefined;
    if (!target) return;
    const coords = target.oCoords?.mtr;
    if (!coords) return;
    rotationGuideState = {
      active: true,
      angle: target.angle ?? 0,
      point: { x: coords.x, y: coords.y }
    };
    canvas.requestRenderAll();
  }

  const onCanvasChanged = (event: fabric.IEvent) => {
    // Ignore decoration churn; store only real user/content changes.
    const target = event.target as fabric.Object | undefined;
    if (isImageObject(target)) applyImageControls(target);
    const objectId = target?.data?.id;
    if (isApplyingDecorations) return;
    if (isLockedDecorationId(objectId)) return;
    bringDecorationsToFront(canvas);
    pushHistory();
  };

  const onTextChanged = (event: fabric.IEvent) => {
    const target = event.target as fabric.Object | undefined;
    if (isApplyingDecorations) return;
    if (isLockedDecorationId(target?.data?.id)) return;
    if (textChangeTimer !== null) window.clearTimeout(textChangeTimer);
    textChangeTimer = window.setTimeout(() => {
      textChangeTimer = null;
      pushHistory();
      emitSelectionStyle();
    }, 120);
  };

  canvas.on("object:added", onCanvasChanged);
  canvas.on("object:modified", onCanvasChanged);
  canvas.on("object:removed", onCanvasChanged);
  canvas.on("object:moving", onObjectMoving);
  canvas.on("object:rotating", onObjectRotating);
  canvas.on("text:changed", onTextChanged);
  canvas.on("before:render", clearGuideLayer);
  canvas.on("after:render", renderGuides);
  canvas.on("mouse:up", onMouseUp);
  canvas.on("selection:created", emitSelectionStyle);
  canvas.on("selection:updated", emitSelectionStyle);
  canvas.on("selection:cleared", emitSelectionStyle);

  onReadyRef?.(true);
  emitSelectionStyle();

  if (page?.fabricJSON) {
    isRestoring = true;
    canvas.loadFromJSON(page.fabricJSON, () => {
      applyImageControlsToCanvas();
      ensureBomTableGroup();
      isRestoring = false;
      ensureHeaderFooter();
      canvas.renderAll();
      seedHistoryFromCanvas();
    });
  } else {
    ensureHeaderFooter();
    if (page?.defaultImageUrl) {
      addDefaultImage(page.defaultImageUrl, {
        recordHistory: false,
        onComplete: () => {
          seedHistoryFromCanvas();
          emitSelectionStyle();
        }
      });
    } else {
      seedHistoryFromCanvas();
    }
  }

  window.addEventListener("keydown", onDeleteKey);
  window.addEventListener("keydown", onClipboardShortcuts);

  const handle: FabricCanvasHandle = {
    addText(initialStyle) {
      const text = new fabric.IText("Editable text", {
        left: 64,
        top: 64,
        fill: "#1f2937",
        fontSize: 24,
        fontFamily: "Georgia",
        fontWeight: initialStyle?.bold ? "bold" : "normal",
        fontStyle: initialStyle?.italic ? "italic" : "normal",
        underline: !!initialStyle?.underline,
        textAlign: initialStyle?.align || "left"
      });
      canvas.add(text);
      canvas.setActiveObject(text);
      canvas.requestRenderAll();
      pushHistory();
      emitSelectionStyle();
    },
    setTextStyle(style) {
      const active = canvas.getActiveObject();
      let changedCanvas = false;

      const applyStyle = (obj: fabric.Object | null | undefined) => {
        if (!isTextObject(obj)) return;
        if (isBomObject(obj)) return;
        const textObj = obj as FabricTextObject;
        changedCanvas = true;
        if (style.fontWeight) {
          textObj.set({ fontWeight: textObj.fontWeight === "bold" ? "normal" : "bold" });
        }
        if (style.fontStyle) {
          textObj.set({ fontStyle: textObj.fontStyle === "italic" ? "normal" : "italic" });
        }
        if (style.underline) {
          textObj.set({ underline: !textObj.underline });
        }
        if (style.fill) textObj.set({ fill: style.fill });
        if (style.fontSize) textObj.set({ fontSize: Number(style.fontSize) || 20 });
      };

      if (active?.type === "activeSelection") {
        (active as fabric.ActiveSelection).getObjects().forEach((obj: fabric.Object) => applyStyle(obj));
      } else {
        applyStyle(active);
        if (active && active.type === "i-text") {
          const activeText = active as fabric.IText;
          if (activeText.isEditing && style.fill) activeText.setSelectionStyles({ fill: style.fill });
        }
      }

      canvas.requestRenderAll();
      if (active) active.setCoords();
      if (changedCanvas) pushHistory();
      emitSelectionStyle();
    },
    alignObjects(align) {
      const selected = canvas.getActiveObjects();
      const targets = selected.length > 0 ? selected : [canvas.getActiveObject()].filter(Boolean) as fabric.Object[];
      let changed = false;

      targets.forEach((obj) => {
        if (isTextObject(obj)) {
          (obj as FabricTextObject).set({ textAlign: align });
          changed = true;
        }
      });

      canvas.requestRenderAll();
      if (changed) pushHistory();
      emitSelectionStyle();
    },
    addImage(dataUrl) {
      fabric.Image.fromURL(
        dataUrl,
        (img) => {
          if (!img) return;
          img.scaleToWidth(300);
          img.set({ left: 64, top: 360 });
          applyImageControls(img);
          canvas.add(img);
          canvas.setActiveObject(img);
          canvas.requestRenderAll();
          pushHistory();
        },
        { crossOrigin: "anonymous" }
      );
    },
    copy() {
      const active = canvas.getActiveObject();
      if (!active) return;
      if (isDecorationId(active.data?.id)) return;
      if (isBomObject(active)) return;
      active.clone((cloned: fabric.Object) => {
        clipboard = cloned;
      });
    },
    paste() {
      if (!clipboard) return;
      clipboard.clone((clonedObj: fabric.Object) => {
        canvas.discardActiveObject();
        clonedObj.set({ left: (clonedObj.left || 0) + 12, top: (clonedObj.top || 0) + 12, evented: true });
        if (clonedObj.type === "activeSelection") {
          const selection = clonedObj as fabric.ActiveSelection;
          selection.canvas = canvas;
          selection.forEachObject((obj: fabric.Object) => canvas.add(obj));
          clonedObj.setCoords();
        } else {
          canvas.add(clonedObj);
        }
        clipboard = clonedObj;
        canvas.setActiveObject(clonedObj);
        canvas.requestRenderAll();
        pushHistory();
      });
    },
    duplicate() {
      handle.copy();
      handle.paste();
    },
    undo() {
      if (!hasPageChanges) return;
      if (historyIndex <= 0) return;
      historyIndex -= 1;
      isRestoring = true;
      canvas.loadFromJSON(JSON.parse(history[historyIndex]), () => {
        applyImageControlsToCanvas();
        ensureBomTableGroup();
        isRestoring = false;
        ensureHeaderFooter();
        canvas.renderAll();
        emitSelectionStyle();
      });
      if (historyIndex === 0) hasPageChanges = false;
      if (currentPageId) onPageChangeRef(currentPageId, JSON.parse(history[historyIndex]));
    },
    redo() {
      if (historyIndex >= history.length - 1) return;
      historyIndex += 1;
      isRestoring = true;
      canvas.loadFromJSON(JSON.parse(history[historyIndex]), () => {
        applyImageControlsToCanvas();
        ensureBomTableGroup();
        isRestoring = false;
        ensureHeaderFooter();
        canvas.renderAll();
        emitSelectionStyle();
      });
      hasPageChanges = historyIndex > 0;
      if (currentPageId) onPageChangeRef(currentPageId, JSON.parse(history[historyIndex]));
    },
    layerUp() {
      moveLayer("up");
    },
    layerDown() {
      moveLayer("down");
    },
    deleteActive() {
      removeActiveObjects();
    },
    async getPageImage() {
      return canvas.toDataURL({ multiplier: 2, format: "png" });
    }
  };

  return {
    handle,
    loadPage,
    setCallbacks(
      nextOnPageChange: (pageId: string, json: FabricJSON) => void,
      nextOnReady?: (ready: boolean) => void,
      nextOnTextSelectionChange?: (state: { bold: boolean; italic: boolean; underline: boolean; align: "left" | "center" | "right" }) => void
    ) {
      onPageChangeRef = nextOnPageChange;
      onReadyRef = nextOnReady;
      onTextSelectionChangeRef = nextOnTextSelectionChange;
    },
    setHeaderFooter(next: {
      headerText?: string;
      headerProjectName?: string;
      headerCustomerName?: string;
      footerLogoUrl?: string;
      pageNumber?: number;
      totalPages?: number;
      designerEmail?: string;
      designerMobile?: string;
    }) {
      if (typeof next.headerText === "string") headerText = next.headerText;
      if (typeof next.headerProjectName === "string") headerProjectName = next.headerProjectName;
      if (typeof next.headerCustomerName === "string") headerCustomerName = next.headerCustomerName;
      if (typeof next.footerLogoUrl === "string") footerLogoUrl = next.footerLogoUrl;
      if (typeof next.pageNumber === "number") pageNumber = next.pageNumber;
      if (typeof next.totalPages === "number") totalPages = next.totalPages;
      if (typeof next.designerEmail === "string") designerEmail = next.designerEmail;
      if (typeof next.designerMobile === "string") designerMobile = next.designerMobile;
      ensureHeaderFooter();
      if (!isDisposed) canvas.requestRenderAll();
    },
    dispose() {
      isDisposed = true;
      if (textChangeTimer !== null) {
        window.clearTimeout(textChangeTimer);
        textChangeTimer = null;
      }
      window.removeEventListener("keydown", onDeleteKey);
      window.removeEventListener("keydown", onClipboardShortcuts);
      canvas.dispose();
      onReadyRef?.(false);
    }
  };
}
