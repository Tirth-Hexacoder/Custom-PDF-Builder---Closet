import { A4_PX } from "@closet/core";
import { fabric } from "fabric";
import type { CreateCanvasOptions, FabricCanvasHandle, FabricJSON, Page, SceneImageInput, SceneImageNote } from "../types";
import { applyPageDecorations, bringDecorationsToFront, isDecorationId, isLockedDecorationId } from "./pageDecorUtils";

const GUIDE_SNAP_THRESHOLD = 6;
const MIN_IMAGE_CROP_SIZE = 24;
const BOM_TABLE_GROUP_ID = "bom-table-group";
const BOM_TABLE_USER_PLACED_KEY = "bomUserPlaced";
const OBJECT_DIMMED_KEY = "objectDimmed";
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

function isBomTableEntity(obj: fabric.Object | null | undefined) {
  const id = obj?.data?.id;
  return id === BOM_TABLE_GROUP_ID || isBomObject(obj);
}

function isBomUserPlaced(obj: fabric.Object | null | undefined) {
  return !!obj?.data?.[BOM_TABLE_USER_PLACED_KEY];
}

function isUserLockedObject(obj: fabric.Object | null | undefined) {
  return !!obj && !!obj.data?.userLocked;
}

function isDimmedObject(obj: fabric.Object | null | undefined) {
  return !!obj && !!obj.data?.[OBJECT_DIMMED_KEY];
}

function getObjectOpacity(obj: fabric.Object | null | undefined) {
  if (!obj) return 1;
  return typeof obj.opacity === "number" ? obj.opacity : 1;
}

function setUserLockedState(obj: fabric.Object, locked: boolean) {
  const isBomEntity = isBomTableEntity(obj);
  obj.set({
    selectable: true,
    evented: true,
    hasControls: !locked,
    lockMovementX: locked,
    lockMovementY: locked,
    lockScalingX: locked,
    lockScalingY: locked,
    lockRotation: isBomEntity ? true : locked,
    lockSkewingX: locked,
    lockSkewingY: locked,
    data: {
      ...(obj.data || {}),
      userLocked: locked
    }
  });
}

function setObjectDimmedState(obj: fabric.Object, dimmed: boolean) {
  setUserLockedState(obj, dimmed);
  obj.set({
    opacity: dimmed ? 0.1 : 1,
    data: {
      ...(obj.data || {}),
      [OBJECT_DIMMED_KEY]: dimmed
    }
  });
}

function isImageObject(obj: fabric.Object | null | undefined): obj is fabric.Image {
  return !!obj && obj.type === "image";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function resolvePageDefaultImages(page?: Page) {
  if (!page) return [] as SceneImageInput[];
  if (Array.isArray(page.defaultImages) && page.defaultImages.length > 0) {
    return page.defaultImages.filter((item): item is SceneImageInput => !!item && typeof item.url === "string" && !!item.url);
  }
  if (page.defaultImage?.url) return [page.defaultImage];
  if (page.defaultImageUrl) {
    return [{
      url: page.defaultImageUrl,
      type: "2D Default" as const,
      notes: [],
      baseUrl: ""
    } satisfies SceneImageInput];
  }
  return [] as SceneImageInput[];
}

function resolvePageDefaultLayout(page: Page | undefined, imageCount: number) {
  if (page?.defaultLayout) return page.defaultLayout;
  if (imageCount <= 1) return "single" as const;
  if (imageCount === 3) return "hero-three" as const;
  return "grid-2-col" as const;
}

function isDefaultImageNoteObject(obj: fabric.Object | null | undefined) {
  return !!obj && !!obj.data && obj.data.source === "default-image-note";
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
  fabric.Object.prototype.centeredRotation = true;

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
  canvas.centeredRotation = true;

  let insertTextModeActive = false;

  const applyInsertTextCursor = () => {
    const cursor = insertTextModeActive ? "crosshair" : "default";
    canvas.defaultCursor = cursor;
    canvas.hoverCursor = cursor;
    canvas.moveCursor = cursor;
    const c = canvas as fabric.Canvas & {
      upperCanvasEl?: HTMLCanvasElement;
      lowerCanvasEl?: HTMLCanvasElement;
    };
    const upper = c.upperCanvasEl;
    const lower = c.lowerCanvasEl;
    if (upper) upper.style.cursor = cursor;
    if (lower) lower.style.cursor = cursor;
  };

  const ensureWhiteBackground = () => {
    canvas.setBackgroundColor("#ffffff", () => undefined);
  };

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
    canvas.getObjects().forEach((obj) => {
      applyImageControls(obj);
      if (isDimmedObject(obj)) {
        setObjectDimmedState(obj, true);
        return;
      }
      if (isUserLockedObject(obj)) setUserLockedState(obj, true);
    });
  };

  const applyBomGroupBehavior = (obj: fabric.Object) => {
    const locked = isUserLockedObject(obj);
    obj.set({
      selectable: true,
      evented: true,
      hasControls: !locked,
      hasBorders: true,
      objectCaching: false,
      lockMovementX: locked,
      lockMovementY: locked,
      lockScalingX: locked,
      lockScalingY: locked,
      lockRotation: true,
      lockSkewingX: true,
      lockSkewingY: true,
      hoverCursor: locked ? "default" : "move",
      moveCursor: locked ? "default" : "move",
      data: {
        ...(obj.data || {}),
        id: BOM_TABLE_GROUP_ID,
        [BOM_TABLE_USER_PLACED_KEY]: isBomUserPlaced(obj)
      }
    });
  };

  const normalizeBomObjectTransform = (obj: fabric.Object) => {
    const center = obj.getCenterPoint();
    obj.set({
      scaleX: 1,
      scaleY: 1,
      angle: 0,
      skewX: 0,
      skewY: 0
    });
    obj.setPositionByOrigin(center, "center", "center");
    obj.setCoords();
  };

  const fitAndClampBomGroup = (obj: fabric.Object) => {
    const pageWidth = canvas.getWidth();
    const pageHeight = canvas.getHeight();
    let bounds = obj.getBoundingRect(true, true);

    if (bounds.width > pageWidth || bounds.height > pageHeight) {
      const fitScale = Math.min(
        (pageWidth - 8) / Math.max(bounds.width, 1),
        (pageHeight - 8) / Math.max(bounds.height, 1),
        1
      );
      if (fitScale < 1) {
        const center = obj.getCenterPoint();
        obj.set({
          scaleX: (obj.scaleX || 1) * fitScale,
          scaleY: (obj.scaleY || 1) * fitScale
        });
        obj.setPositionByOrigin(center, "center", "center");
        obj.setCoords();
        bounds = obj.getBoundingRect(true, true);
      }
    }

    let offsetX = 0;
    let offsetY = 0;
    if (bounds.left < 0) offsetX = -bounds.left;
    if (bounds.left + bounds.width > pageWidth) {
      offsetX += pageWidth - (bounds.left + bounds.width);
    }
    if (bounds.top < 0) offsetY = -bounds.top;
    if (bounds.top + bounds.height > pageHeight) {
      offsetY += pageHeight - (bounds.top + bounds.height);
    }
    if (offsetX !== 0 || offsetY !== 0) {
      obj.set({
        left: (obj.left || 0) + offsetX,
        top: (obj.top || 0) + offsetY
      });
      obj.setCoords();
    }
  };

  const centerBomGroupHorizontally = (obj: fabric.Object) => {
    const bounds = obj.getBoundingRect(true, true);
    const desiredLeft = (canvas.getWidth() - bounds.width) / 2;
    const delta = desiredLeft - bounds.left;
    if (Math.abs(delta) < 0.5) return;
    obj.set({ left: (obj.left || 0) + delta });
    obj.setCoords();
  };

  const ensureBomTableGroup = () => {
    const existingGroup = canvas.getObjects().find((obj) => obj.data?.id === BOM_TABLE_GROUP_ID);
    if (existingGroup) {
      applyBomGroupBehavior(existingGroup);
      fitAndClampBomGroup(existingGroup);
      if (!isBomUserPlaced(existingGroup)) {
        centerBomGroupHorizontally(existingGroup);
      }
      return;
    }

    const bomParts = canvas.getObjects().filter((obj) => isBomTablePart(obj));
    if (bomParts.length === 0) return;

    bomParts.forEach((obj) => {
      const hasTransform =
        Math.abs((obj.scaleX || 1) - 1) > 0.001 ||
        Math.abs((obj.scaleY || 1) - 1) > 0.001 ||
        Math.abs(obj.angle || 0) > 0.01 ||
        Math.abs(obj.skewX || 0) > 0.01 ||
        Math.abs(obj.skewY || 0) > 0.01;
      if (hasTransform) normalizeBomObjectTransform(obj);
      obj.set({
        selectable: false,
        evented: false,
        hasControls: false,
        lockMovementX: true,
        lockMovementY: true,
        lockScalingX: true,
        lockScalingY: true,
        lockRotation: true
      });
      obj.setCoords();
    });

    const group = new fabric.Group(bomParts);
    bomParts.forEach((obj) => canvas.remove(obj));
    group.set({
      data: {
        ...(group.data || {}),
        [BOM_TABLE_USER_PLACED_KEY]: false
      }
    });
    applyBomGroupBehavior(group);
    canvas.add(group);
    fitAndClampBomGroup(group);
    centerBomGroupHorizontally(group);
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
  const activeSelectionVisualState = new Map<fabric.Object, { hasBorders: boolean; hasControls: boolean }>();

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
  let rotationInputEl: HTMLInputElement | null = null;

  function canShowRotationControls(target: fabric.Object | null | undefined) {
    if (!target) return false;
    if (isBomTableEntity(target)) return false;
    if (isLockedDecorationId(target.data?.id)) return false;
    return true;
  }

  function ensureRotationInputElement() {
    if (rotationInputEl || typeof document === "undefined") return;
    const container = host.parentElement;
    if (!container) return;
    if (getComputedStyle(container).position === "static") {
      container.style.position = "relative";
    }
    const input = document.createElement("input");
    input.type = "number";
    input.step = "1";
    input.min = "-360";
    input.max = "360";
    input.title = "Set rotation angle";
    input.style.position = "absolute";
    input.style.width = "62px";
    input.style.height = "24px";
    input.style.padding = "2px 6px";
    input.style.fontSize = "12px";
    input.style.border = "1px solid #cbd5e1";
    input.style.borderRadius = "6px";
    input.style.background = "rgba(255,255,255,0.95)";
    input.style.color = "#0f172a";
    input.style.boxShadow = "0 1px 3px rgba(15,23,42,0.12)";
    input.style.zIndex = "15";
    input.style.display = "none";
    input.style.pointerEvents = "auto";

    const applyRotationFromInput = (commitHistory: boolean) => {
      const raw = Number(input.value);
      if (!Number.isFinite(raw)) return;
      const active = canvas.getActiveObject();
      if (!canShowRotationControls(active)) return;
      const normalized = ((raw % 360) + 360) % 360;
      const center = active.getCenterPoint();
      active.set({ angle: normalized });
      active.setPositionByOrigin(center, "center", "center");
      active.setCoords();
      canvas.requestRenderAll();
      updateRotationGuideFromActiveSelection();
      if (commitHistory) pushHistory();
    };

    input.addEventListener("input", () => {
      applyRotationFromInput(false);
    });

    input.addEventListener("change", () => {
      applyRotationFromInput(true);
    });

    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      applyRotationFromInput(true);
    });

    container.appendChild(input);
    rotationInputEl = input;
  }

  function hideRotationInput() {
    if (!rotationInputEl) return;
    rotationInputEl.style.display = "none";
  }

  function updateRotationInputFromActiveSelection() {
    ensureRotationInputElement();
    if (!rotationInputEl) return;
    const active = canvas.getActiveObject();
    if (!canShowRotationControls(active)) {
      hideRotationInput();
      return;
    }
    const coords = active?.oCoords?.mtr;
    if (!coords) {
      hideRotationInput();
      return;
    }
    const rounded = Math.round(active?.angle || 0);
    rotationInputEl.value = String(rounded);
    rotationInputEl.style.left = `${coords.x - 31}px`;
    rotationInputEl.style.top = `${coords.y - 44}px`;
    rotationInputEl.style.display = "block";
  }

  function updateRotationGuideFromActiveSelection() {
    const active = canvas.getActiveObject();
    if (!canShowRotationControls(active)) {
      rotationGuideState = { active: false, angle: 0, point: null };
      hideRotationInput();
      return;
    }
    const coords = active?.oCoords?.mtr;
    if (!coords) {
      rotationGuideState = { active: false, angle: 0, point: null };
      hideRotationInput();
      return;
    }
    rotationGuideState = {
      active: true,
      angle: active?.angle ?? 0,
      point: { x: coords.x, y: coords.y }
    };
  }

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
    const hasSelection = !!obj;
    const locked = isUserLockedObject(obj);
    const dimmed = isDimmedObject(obj);
    const opacity = getObjectOpacity(obj);
    if (!isTextObject(obj) || isBomObject(obj)) {
      return {
        bold: false,
        italic: false,
        underline: false,
        align: "left" as const,
        locked,
        dimmed,
        opacity,
        hasSelection,
        canEditTextStyle: false
      };
    }
    const textObj = obj as FabricTextObject;
    const align: "left" | "center" | "right" =
      textObj.textAlign === "center" || textObj.textAlign === "right" ? textObj.textAlign : "left";
    return {
      bold: textObj.fontWeight === "bold" || Number(textObj.fontWeight) >= 600,
      italic: textObj.fontStyle === "italic",
      underline: !!textObj.underline,
      align,
      locked,
      dimmed,
      opacity,
      hasSelection,
      canEditTextStyle: true
    };
  }

  function emitSelectionStyle() {
    if (!onTextSelectionChangeRef) return;
    const active = canvas.getActiveObject();
    if (active?.type === "activeSelection") {
      const selection = active as fabric.ActiveSelection;
      const textTarget = selection.getObjects().find((obj) => isTextObject(obj) && !isBomObject(obj));
      const lockTarget = selection.getObjects()[0] ?? null;
      const state = toToolbarState(textTarget ?? lockTarget);
      const allLocked = selection.getObjects().every((obj) => isUserLockedObject(obj));
      const allDimmed = selection.getObjects().every((obj) => isDimmedObject(obj));
      const canEditTextStyle =
        selection.getObjects().length > 0 &&
        selection.getObjects().every((obj) => isTextObject(obj) && !isBomObject(obj));
      const averageOpacity =
        selection.getObjects().length > 0
          ? selection.getObjects().reduce((sum, obj) => sum + getObjectOpacity(obj), 0) / selection.getObjects().length
          : 1;
      onTextSelectionChangeRef({
        ...state,
        locked: allLocked,
        dimmed: allDimmed,
        opacity: averageOpacity,
        hasSelection: selection.getObjects().length > 0,
        canEditTextStyle
      });
      return;
    }
    onTextSelectionChangeRef(toToolbarState(active));
  }

  function clearActiveSelectionInnerVisuals() {
    activeSelectionVisualState.forEach((state, obj) => {
      obj.set({
        hasBorders: state.hasBorders,
        hasControls: state.hasControls
      });
      obj.setCoords();
    });
    activeSelectionVisualState.clear();
  }

  function applyActiveSelectionInnerVisuals() {
    const active = canvas.getActiveObject();
    if (!active || active.type !== "activeSelection") {
      clearActiveSelectionInnerVisuals();
      return;
    }
    const selection = active as fabric.ActiveSelection;
    selection.getObjects().forEach((obj) => {
      if (!activeSelectionVisualState.has(obj)) {
        activeSelectionVisualState.set(obj, {
          hasBorders: obj.hasBorders !== false,
          hasControls: obj.hasControls !== false
        });
      }
      obj.set({
        hasBorders: false,
        hasControls: false
      });
      obj.setCoords();
    });
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

  function clearDefaultImageNotes() {
    const staleNoteObjects = canvas.getObjects().filter((obj) => isDefaultImageNoteObject(obj));
    staleNoteObjects.forEach((obj) => canvas.remove(obj));
  }

  function addNotesForPlacedImage(img: fabric.Image, sceneImage: SceneImageInput) {
    const notes = Array.isArray(sceneImage.notes) ? sceneImage.notes : [];
    if (notes.length === 0) return;
    const left = img.left || 0;
    const top = img.top || 0;
    const width = img.getScaledWidth();
    const height = img.getScaledHeight();
    notes.forEach((note) => {
      if (!note || !note.text || !note.id) return;
      const xPercent = clamp(Number(note.xPercent) || 0, 0, 100);
      const yPercent = clamp(Number(note.yPercent) || 0, 0, 100);
      const text = new fabric.Textbox(note.text, {
        left: left + (xPercent / 100) * width,
        top: top + (yPercent / 100) * height,
        fill: note.fontColor || "#111827",
        fontSize: Number(note.fontSize) || 18,
        fontFamily: note.fontType || "Georgia",
        editable: true,
        data: {
          id: `image-note-${note.id}`,
          source: "default-image-note",
          noteId: note.id,
          imageUrl: sceneImage.url
        }
      });
      canvas.add(text);
    });
  }

  function buildDefaultImageCells(
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
      const cellHeight = contentHeight / rows;
      const cellWidth = contentWidth / cols;
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

  function addDefaultImages(
    defaultImages: SceneImageInput[],
    defaultLayout: "single" | "grid-2-col" | "hero-three" | "stack" | "top-grid" | "wall-grid",
    opts?: { recordHistory?: boolean; onComplete?: () => void }
  ) {
    const cells = buildDefaultImageCells(defaultImages, defaultLayout);
    clearDefaultImageNotes();
    if (cells.length === 0) {
      opts?.onComplete?.();
      return;
    }

    const loadByIndex = (index: number) => {
      if (index >= cells.length) {
        ensureHeaderFooter();
        if (!isDisposed) canvas.requestRenderAll();
        if (opts?.recordHistory !== false) pushHistory();
        opts?.onComplete?.();
        return;
      }
      const cell = cells[index];
      fabric.Image.fromURL(
        cell.image.url,
        (img) => {
          if (!img || isDisposed) {
            loadByIndex(index + 1);
            return;
          }
          const sourceWidth = img.width || 1;
          const sourceHeight = img.height || 1;
          const scale = Math.min(cell.width / sourceWidth, cell.height / sourceHeight, 1);
          img.scale(scale);
          img.set({
            left: cell.left + (cell.width - img.getScaledWidth()) / 2,
            top: cell.top + (cell.height - img.getScaledHeight()) / 2,
            data: {
              ...(img.data || {}),
              id: "default-page-image",
              source: "default-image",
              defaultImageUrl: cell.image.url
            }
          });
          applyImageControls(img);
          canvas.add(img);
          addNotesForPlacedImage(img, cell.image);
          loadByIndex(index + 1);
        },
        { crossOrigin: "anonymous" }
      );
    };

    loadByIndex(0);
  }

  function syncDefaultImageMetadata(defaultImages: SceneImageInput[]) {
    clearDefaultImageNotes();
    if (!Array.isArray(defaultImages) || defaultImages.length === 0) return;
    const imageObjects = canvas.getObjects().filter((obj) => obj.type === "image") as fabric.Image[];
    const remainingImageObjects = [...imageObjects];

    defaultImages.forEach((defaultImage) => {
      if (!defaultImage?.url) return;
      let imageObject = imageObjects.find((obj) => obj.data?.defaultImageUrl === defaultImage.url);
      if (!imageObject && remainingImageObjects.length > 0) {
        imageObject = remainingImageObjects[0];
      }
      if (!imageObject) return;
      imageObject.set({
        data: {
          ...(imageObject.data || {}),
          id: "default-page-image",
          source: "default-image",
          defaultImageUrl: defaultImage.url
        }
      });
      const usedIndex = remainingImageObjects.indexOf(imageObject);
      if (usedIndex >= 0) remainingImageObjects.splice(usedIndex, 1);
      addNotesForPlacedImage(imageObject, defaultImage);
    });
  }

  function loadPage(nextPage?: Page) {
    // Switch canvas state to another page and rebuild history/decorations.
    if (!nextPage || isDisposed) return;
    if (nextPage.id === currentPageId) return;
    currentPageId = nextPage.id;
    isRestoring = true;
    canvas.clear();
    ensureWhiteBackground();
    if (nextPage.fabricJSON) {
      const defaultImages = resolvePageDefaultImages(nextPage);
      canvas.loadFromJSON(nextPage.fabricJSON, () => {
        ensureWhiteBackground();
        applyImageControlsToCanvas();
        ensureBomTableGroup();
        syncDefaultImageMetadata(defaultImages);
        isRestoring = false;
        ensureHeaderFooter();
        canvas.renderAll();
        seedHistoryFromCanvas();
        if (currentPageId) onPageChangeRef(currentPageId, buildPersistedJson());
        emitSelectionStyle();
      });
    } else {
      isRestoring = false;
      ensureWhiteBackground();
      ensureHeaderFooter();
      const defaultImages = resolvePageDefaultImages(nextPage);
      const defaultLayout = resolvePageDefaultLayout(nextPage, defaultImages.length);
      if (defaultImages.length > 0) {
        addDefaultImages(defaultImages, defaultLayout, {
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

    const canvasObjects = canvas.getObjects();
    const orderedTargets = targets
      .filter((obj) => !isLockedDecorationId(obj.data?.id))
      .sort((a, b) => canvasObjects.indexOf(a) - canvasObjects.indexOf(b));

    if (orderedTargets.length === 0) return;

    let changed = false;
    if (direction === "up") {
      orderedTargets.forEach((obj) => {
        canvas.bringToFront(obj);
        changed = true;
      });
    } else {
      [...orderedTargets].reverse().forEach((obj) => {
        canvas.sendToBack(obj);
        changed = true;
      });
    }

    if (!changed) return;
    bringDecorationsToFront(canvas);
    canvas.requestRenderAll();
    pushHistory();
  }

  function toggleObjectLock() {
    const activeObjects = canvas.getActiveObjects();
    const targets = activeObjects.length > 0
      ? activeObjects
      : [canvas.getActiveObject()].filter(Boolean) as fabric.Object[];
    if (targets.length === 0) return;

    const editableTargets = targets.filter((obj) => !isLockedDecorationId(obj.data?.id));
    if (editableTargets.length === 0) return;
    const allLocked = editableTargets.every((obj) => isUserLockedObject(obj));
    const hasDimmed = editableTargets.some((obj) => isDimmedObject(obj));
    const shouldUnlock = allLocked && !hasDimmed;

    editableTargets.forEach((obj) => {
      setUserLockedState(obj, !shouldUnlock);
      obj.setCoords();
    });

    canvas.requestRenderAll();
    pushHistory();
    emitSelectionStyle();
  }

  function toggleObjectVisibility() {
    const activeObjects = canvas.getActiveObjects();
    const targets = activeObjects.length > 0
      ? activeObjects
      : [canvas.getActiveObject()].filter(Boolean) as fabric.Object[];
    if (targets.length === 0) return;

    const editableTargets = targets.filter((obj) => !isLockedDecorationId(obj.data?.id));
    if (editableTargets.length === 0) return;
    const shouldUndim = editableTargets.every((obj) => isDimmedObject(obj));

    editableTargets.forEach((obj) => {
      setObjectDimmedState(obj, !shouldUndim);
      obj.setCoords();
    });

    canvas.requestRenderAll();
    pushHistory();
    emitSelectionStyle();
  }

  function clearGuides() {
    guideState = { active: false, bounds: null, showCenterX: false, showCenterY: false };
    alignGuideState = { x: null, y: null };
    updateRotationGuideFromActiveSelection();
    updateRotationInputFromActiveSelection();
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

    const activeObjects = canvas.getActiveObjects();
    activeObjects.forEach((obj) => {
      if (!isUserLockedObject(obj)) return;
      const bounds = obj.getBoundingRect(true, true);
      const x = bounds.left + bounds.width - 8;
      const y = bounds.top + 8;
      ctx.save();
      ctx.fillStyle = "#111827";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(x - 7, y + 1, 14, 11);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 4.2, Math.PI, 0);
      ctx.stroke();
      ctx.restore();
    });
  }

  function onObjectMoving(event: fabric.IEvent) {
    const target = event.target as fabric.Object | undefined;
    if (!target) return;
    if (isUserLockedObject(target)) return;
    if (target.data?.id === BOM_TABLE_GROUP_ID && !isBomUserPlaced(target)) {
      target.set({
        data: {
          ...(target.data || {}),
          [BOM_TABLE_USER_PLACED_KEY]: true
        }
      });
    }

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
    if (isBomTableEntity(target)) return;
    if (isUserLockedObject(target)) return;
    const coords = target.oCoords?.mtr;
    if (!coords) return;
    rotationGuideState = {
      active: true,
      angle: target.angle ?? 0,
      point: { x: coords.x, y: coords.y }
    };
    updateRotationInputFromActiveSelection();
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

  const onSelectionCreatedOrUpdated = () => {
    applyActiveSelectionInnerVisuals();
    updateRotationGuideFromActiveSelection();
    updateRotationInputFromActiveSelection();
    emitSelectionStyle();
  };

  const onSelectionCleared = () => {
    clearActiveSelectionInnerVisuals();
    rotationGuideState = { active: false, angle: 0, point: null };
    hideRotationInput();
    emitSelectionStyle();
  };

  canvas.on("object:added", onCanvasChanged);
  canvas.on("object:modified", onCanvasChanged);
  canvas.on("object:removed", onCanvasChanged);
  canvas.on("object:moving", onObjectMoving);
  canvas.on("object:rotating", onObjectRotating);
  canvas.on("text:changed", onTextChanged);
  canvas.on("before:render", clearGuideLayer);
  canvas.on("after:render", renderGuides);
  canvas.on("after:render", updateRotationInputFromActiveSelection);
  canvas.on("mouse:up", onMouseUp);
  canvas.on("selection:created", onSelectionCreatedOrUpdated);
  canvas.on("selection:updated", onSelectionCreatedOrUpdated);
  canvas.on("selection:cleared", onSelectionCleared);

  onReadyRef?.(true);
  emitSelectionStyle();

  if (page?.fabricJSON) {
    const defaultImages = resolvePageDefaultImages(page);
    isRestoring = true;
    canvas.loadFromJSON(page.fabricJSON, () => {
      ensureWhiteBackground();
      applyImageControlsToCanvas();
      ensureBomTableGroup();
      syncDefaultImageMetadata(defaultImages);
      isRestoring = false;
      ensureHeaderFooter();
      canvas.renderAll();
      seedHistoryFromCanvas();
      if (currentPageId) onPageChangeRef(currentPageId, buildPersistedJson());
    });
  } else {
    ensureHeaderFooter();
    const defaultImages = resolvePageDefaultImages(page);
    const defaultLayout = resolvePageDefaultLayout(page, defaultImages.length);
    if (defaultImages.length > 0) {
      addDefaultImages(defaultImages, defaultLayout, {
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
    addText(initialStyle, at) {
      const left = Math.max(8, Math.min(canvas.getWidth() - 8, at?.left ?? 64));
      const top = Math.max(8, Math.min(canvas.getHeight() - 8, at?.top ?? 64));
      const text = new fabric.IText("Editable text", {
        left,
        top,
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
    setOpacity(opacityValue) {
      const activeObjects = canvas.getActiveObjects();
      const targets = activeObjects.length > 0
        ? activeObjects
        : [canvas.getActiveObject()].filter(Boolean) as fabric.Object[];
      if (targets.length === 0) return;
      const value = Math.max(0.05, Math.min(1, opacityValue));
      let changed = false;

      targets.forEach((obj) => {
        if (isLockedDecorationId(obj.data?.id)) return;
        obj.set({
          opacity: value,
          data: {
            ...(obj.data || {}),
            [OBJECT_DIMMED_KEY]: false
          }
        });
        obj.setCoords();
        changed = true;
      });

      if (!changed) return;
      canvas.requestRenderAll();
      pushHistory();
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
        ensureWhiteBackground();
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
        ensureWhiteBackground();
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
    toggleLock() {
      toggleObjectLock();
    },
    toggleVisibility() {
      toggleObjectVisibility();
    },
    setInsertTextMode(enabled) {
      insertTextModeActive = enabled;
      applyInsertTextCursor();
      canvas.requestRenderAll();
    },
    deleteActive() {
      removeActiveObjects();
    },
    async getPageImage() {
      return canvas.toDataURL({ multiplier: 2, format: "jpeg", quality: 0.86 });
    }
  };

  return {
    handle,
    loadPage,
    setCallbacks(
      nextOnPageChange: (pageId: string, json: FabricJSON) => void,
      nextOnReady?: (ready: boolean) => void,
      nextOnTextSelectionChange?: (state: {
        bold: boolean;
        italic: boolean;
        underline: boolean;
        align: "left" | "center" | "right";
        locked: boolean;
        dimmed: boolean;
        opacity: number;
        hasSelection: boolean;
        canEditTextStyle: boolean;
      }) => void
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
      clearActiveSelectionInnerVisuals();
      if (rotationInputEl) {
        rotationInputEl.remove();
        rotationInputEl = null;
      }
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
