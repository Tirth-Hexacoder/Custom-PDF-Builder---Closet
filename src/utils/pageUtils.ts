import { A4_PX } from "@closet/core";
import { fabric } from "fabric";
import type { FabricJSON, Page } from "../state/builderStore";

export type FabricCanvasHandle = {
  addText: () => void;
  setTextStyle: (style: { fontWeight?: string; fontStyle?: string; underline?: boolean; fill?: string; fontSize?: number }) => void;
  setTextAlign: (align: "left" | "center" | "right" | "justify") => void;
  alignObjects: (align: "left" | "center" | "right") => void;
  addPlaceholder: (key: string) => void;
  addBOMTable: (rows: Array<{ sku: string; name: string; qty: number; price: number }>) => void;
  addImage: (dataUrl: string) => void;
  copy: () => void;
  paste: () => void;
  duplicate: () => void;
  undo: () => void;
  redo: () => void;
  deleteActive: () => void;
  getPageImage: () => Promise<string>;
};

type PageCanvasControllerOptions = {
  host: HTMLCanvasElement;
  page?: Page;
  onPageChange: (json: FabricJSON) => void;
  onReady?: (ready: boolean) => void;
};

function createBOMText(rows: Array<{ sku: string; name: string; qty: number; price: number }>) {
  const lines = ["BILL OF MATERIALS", "-----------------"];
  rows.forEach((r, i) => lines.push(`${i + 1}. ${r.sku} | ${r.name} | Qty: ${r.qty} | $${r.price}`));
  return lines.join("\n");
}

function isTextObject(obj: fabric.Object | null | undefined) {
  return obj && ["i-text", "textbox", "text"].includes(obj.type);
}

type GuideState = {
  active: boolean;
  bounds: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  } | null;
  showCenterX: boolean;
  showCenterY: boolean;
};

type RotationGuideState = {
  active: boolean;
  angle: number;
  point: { x: number; y: number } | null;
};

export class PageCanvasController {
  private static GUIDE_SNAP_THRESHOLD = 6;
  private static rotationGlyph: string | null = null;
  private canvas: fabric.Canvas | null = null;
  private clipboard: fabric.Object | null = null;
  private history: string[] = [];
  private historyIndex = -1;
  private hasPageChanges = false;
  private isRestoring = false;
  private currentPageId: string | null = null;
  private onPageChange: (json: FabricJSON) => void;
  private onReady?: (ready: boolean) => void;
  private defaultTextStyle = {
    fill: "#1f2937",
    fontSize: 24,
    fontFamily: "Georgia",
    fontWeight: "normal",
    fontStyle: "normal",
    underline: false
  };
  private handleDeleteKey: (event: KeyboardEvent) => void;
  private handleClipboardShortcuts: (event: KeyboardEvent) => void;
  private guideState: GuideState = {
    active: false,
    bounds: null,
    showCenterX: false,
    showCenterY: false
  };
  private handleObjectMoving: (event: fabric.IEvent) => void;
  private handleObjectRotating: (event: fabric.IEvent) => void;
  private handleMouseUp: () => void;
  private handleBeforeRender: () => void;
  private handleAfterRender: () => void;
  private rotationGuideState: RotationGuideState = {
    active: false,
    angle: 0,
    point: null
  };

  constructor({ host, page, onPageChange, onReady }: PageCanvasControllerOptions) {
    this.onPageChange = onPageChange;
    this.onReady = onReady;
    this.handleDeleteKey = (event: KeyboardEvent) => this.onDeleteKey(event);
    this.handleClipboardShortcuts = (event: KeyboardEvent) => this.onClipboardShortcuts(event);
    this.handleObjectMoving = (event: fabric.IEvent) => this.onObjectMoving(event);
    this.handleObjectRotating = (event: fabric.IEvent) => this.onObjectRotating(event);
    this.handleMouseUp = () => this.clearGuides();
    this.handleBeforeRender = () => this.clearGuideLayer();
    this.handleAfterRender = () => this.renderGuides();
    this.initCanvas(host, page);
  }

  setCallbacks(onPageChange: (json: FabricJSON) => void, onReady?: (ready: boolean) => void) {
    this.onPageChange = onPageChange;
    this.onReady = onReady;
  }

  dispose() {
    window.removeEventListener("keydown", this.handleDeleteKey);
    window.removeEventListener("keydown", this.handleClipboardShortcuts);
    this.canvas?.dispose();
    this.onReady?.(false);
  }

  loadPage(page?: Page) {
    if (!this.canvas || !page) return;
    if (page.id === this.currentPageId) return;
    this.currentPageId = page.id;
    this.isRestoring = true;
    this.canvas.clear();
    this.canvas.setBackgroundColor("#fff", this.canvas.renderAll.bind(this.canvas));
    if (page.fabricJSON) {
      this.canvas.loadFromJSON(page.fabricJSON, () => {
        this.isRestoring = false;
        this.canvas?.renderAll();
        this.seedHistoryFromCanvas();
      });
    } else {
      this.isRestoring = false;
      this.canvas.renderAll();
      this.seedHistoryFromCanvas();
    }
  }

  getHandle(): FabricCanvasHandle {
    return {
      addText: () => this.addText(),
      setTextStyle: (style) => this.setTextStyle(style),
      setTextAlign: (align) => this.setTextAlign(align),
      alignObjects: (align) => this.alignObjects(align),
      addPlaceholder: (key) => this.addPlaceholder(key),
      addBOMTable: (rows) => this.addBOMTable(rows),
      addImage: (dataUrl) => this.addImage(dataUrl),
      copy: () => this.copy(),
      paste: () => this.paste(),
      duplicate: () => this.duplicate(),
      undo: () => this.undo(),
      redo: () => this.redo(),
      deleteActive: () => this.deleteActive(),
      getPageImage: () => this.getPageImage()
    };
  }

  private initCanvas(host: HTMLCanvasElement, page?: Page) {
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
    this.canvas = canvas;
    this.currentPageId = page?.id ?? null;

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
      const centerX = left;
      const centerY = top;
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate((fabricObject.angle || 0) * (Math.PI / 180));
      const glyph = PageCanvasController.getRotationGlyph();
      if (glyph) {
        ctx.fillStyle = "#f97316";
        ctx.font = "900 16px \"Font Awesome 6 Free\"";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(glyph, 0, 0);
      } else {
        const radius = 7;
        ctx.strokeStyle = "#f97316";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, radius, Math.PI * 0.1, Math.PI * 1.6);
        ctx.stroke();

        const arrowX = radius * Math.cos(Math.PI * 1.6);
        const arrowY = radius * Math.sin(Math.PI * 1.6);
        ctx.beginPath();
        ctx.moveTo(arrowX, arrowY);
        ctx.lineTo(arrowX - 4, arrowY - 2);
        ctx.lineTo(arrowX - 1, arrowY + 5);
        ctx.closePath();
        ctx.fillStyle = "#f97316";
        ctx.fill();
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

    canvas.on("object:added", this.pushHistory);
    canvas.on("object:modified", this.pushHistory);
    canvas.on("object:removed", this.pushHistory);
    canvas.on("object:moving", this.handleObjectMoving);
    canvas.on("object:rotating", this.handleObjectRotating);
    canvas.on("before:render", this.handleBeforeRender);
    canvas.on("after:render", this.handleAfterRender);
    canvas.on("mouse:up", this.handleMouseUp);
    this.onReady?.(true);

    if (page?.fabricJSON) {
      this.isRestoring = true;
      canvas.loadFromJSON(page.fabricJSON, () => {
        this.isRestoring = false;
        canvas.renderAll();
        this.seedHistoryFromCanvas();
      });
    } else {
      this.seedHistoryFromCanvas();
    }

    window.addEventListener("keydown", this.handleDeleteKey);
    window.addEventListener("keydown", this.handleClipboardShortcuts);
  }

  private static getRotationGlyph() {
    if (PageCanvasController.rotationGlyph !== null) return PageCanvasController.rotationGlyph;
    if (typeof document === "undefined") {
      PageCanvasController.rotationGlyph = null;
      return null;
    }
    const el = document.createElement("i");
    el.className = "fa-solid fa-rotate-right";
    el.style.position = "absolute";
    el.style.left = "-9999px";
    el.style.fontSize = "16px";
    document.body.appendChild(el);
    const content = getComputedStyle(el, "::before").getPropertyValue("content");
    document.body.removeChild(el);

    if (!content || content === "none") {
      PageCanvasController.rotationGlyph = null;
      return null;
    }
    const cleaned = content.replace(/['"]/g, "");
    if (cleaned.startsWith("\\")) {
      const code = cleaned.replace("\\", "");
      const char = String.fromCharCode(parseInt(code, 16));
      PageCanvasController.rotationGlyph = char;
      return char;
    }
    PageCanvasController.rotationGlyph = cleaned;
    return cleaned;
  }

  private seedHistoryFromCanvas = () => {
    if (!this.canvas) return;
    const json = JSON.stringify(this.canvas.toJSON(["data"]));
    this.history = [json];
    this.historyIndex = 0;
    this.hasPageChanges = false;
  };

  private pushHistory = ({ markChange = true }: { markChange?: boolean } = {}) => {
    if (!this.canvas || this.isRestoring) return;
    const json = JSON.stringify(this.canvas.toJSON(["data"]));
    const latest = this.history[this.historyIndex];
    if (latest === json) return;
    const list = this.history.slice(0, this.historyIndex + 1);
    list.push(json);
    this.history = list.slice(-50);
    this.historyIndex = this.history.length - 1;
    if (markChange) this.hasPageChanges = true;
    this.onPageChange(JSON.parse(json));
  };

  private onObjectMoving(event: fabric.IEvent) {
    if (!this.canvas) return;
    const target = event.target as fabric.Object | undefined;
    if (!target) return;

    const pageWidth = this.canvas.getWidth();
    const pageHeight = this.canvas.getHeight();
    const center = target.getCenterPoint();
    const pageCenterX = pageWidth / 2;
    const pageCenterY = pageHeight / 2;

    const snapThreshold = PageCanvasController.GUIDE_SNAP_THRESHOLD;
    let snappedX = false;
    let snappedY = false;

    if (Math.abs(center.x - pageCenterX) <= snapThreshold) {
      target.setPositionByOrigin(new fabric.Point(pageCenterX, center.y), "center", "center");
      snappedX = true;
    }
    if (Math.abs(center.y - pageCenterY) <= snapThreshold) {
      const newCenter = target.getCenterPoint();
      target.setPositionByOrigin(new fabric.Point(newCenter.x, pageCenterY), "center", "center");
      snappedY = true;
    }

    target.setCoords();

    const bounds = target.getBoundingRect(true, true);
    this.guideState = {
      active: true,
      bounds: {
        left: bounds.left,
        right: bounds.left + bounds.width,
        top: bounds.top,
        bottom: bounds.top + bounds.height,
        width: bounds.width,
        height: bounds.height,
        centerX: bounds.left + bounds.width / 2,
        centerY: bounds.top + bounds.height / 2
      },
      showCenterX: snappedX || Math.abs(center.x - pageCenterX) <= snapThreshold * 1.5,
      showCenterY: snappedY || Math.abs(center.y - pageCenterY) <= snapThreshold * 1.5
    };

    this.canvas.requestRenderAll();
  }

  private onObjectRotating(event: fabric.IEvent) {
    if (!this.canvas) return;
    const target = event.target as fabric.Object | undefined;
    if (!target) return;
    const coords = target.oCoords?.mtr;
    if (!coords) return;
    this.rotationGuideState = {
      active: true,
      angle: target.angle ?? 0,
      point: { x: coords.x, y: coords.y }
    };
    this.canvas.requestRenderAll();
  }

  private clearGuides() {
    if (!this.canvas) return;
    if (!this.guideState.active && !this.rotationGuideState.active) return;
    this.guideState = { active: false, bounds: null, showCenterX: false, showCenterY: false };
    this.rotationGuideState = { active: false, angle: 0, point: null };
    this.canvas.requestRenderAll();
  }

  private clearGuideLayer() {
    if (!this.canvas) return;
    const ctx = this.canvas.contextTop;
    if (!ctx) return;
    this.canvas.clearContext(ctx);
  }

  private renderGuides() {
    if (!this.canvas) return;
    const ctx = this.canvas.contextTop;
    if (!ctx) return;
    const shouldRenderGuides = this.guideState.active && this.guideState.bounds;
    const shouldRenderRotation = this.rotationGuideState.active && this.rotationGuideState.point;
    if (!shouldRenderGuides && !shouldRenderRotation) return;

    const pageWidth = this.canvas.getWidth();
    const pageHeight = this.canvas.getHeight();

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

    if (shouldRenderGuides && this.guideState.bounds) {
      const { bounds, showCenterX, showCenterY } = this.guideState;
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

    if (shouldRenderRotation && this.rotationGuideState.point) {
      const { angle, point } = this.rotationGuideState;
      const normalized = ((Math.round(angle) % 360) + 360) % 360;
      const label = `${normalized}°`;
      drawLabel(label, point.x, point.y - 18);
    }
  }

  private removeActiveObjects() {
    if (!this.canvas) return false;
    const activeObjects = this.canvas.getActiveObjects();
    if (activeObjects.length > 0) {
      this.canvas.discardActiveObject();
      activeObjects.forEach((obj) => this.canvas?.remove(obj));
      this.canvas.requestRenderAll();
      this.pushHistory();
      return true;
    }
    const activeObject = this.canvas.getActiveObject();
    if (activeObject) {
      this.canvas.discardActiveObject();
      this.canvas.remove(activeObject);
      this.canvas.requestRenderAll();
      this.pushHistory();
      return true;
    }
    return false;
  }

  private onDeleteKey(event: KeyboardEvent) {
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    const target = event.target as HTMLElement | null;
    const targetTag = target?.tagName?.toLowerCase();
    const isTypingField =
      target?.isContentEditable ||
      targetTag === "input" ||
      targetTag === "textarea" ||
      targetTag === "select";
    const active = this.canvas?.getActiveObject();
    if (isTypingField || (isTextObject(active) && active.isEditing)) return;
    if (this.removeActiveObjects()) event.preventDefault();
  }

  private onClipboardShortcuts(event: KeyboardEvent) {
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
    const active = this.canvas?.getActiveObject();
    if (isTypingField || (isTextObject(active) && active.isEditing)) return;

    if (key === "c") {
      event.preventDefault();
      this.clipboard = null;
      const activeObj = this.canvas?.getActiveObject();
      if (activeObj) {
        activeObj.clone((cloned) => {
          this.clipboard = cloned;
        });
      }
    }

    if (key === "x") {
      event.preventDefault();
      const activeObj = this.canvas?.getActiveObject();
      if (activeObj) {
        activeObj.clone((cloned) => {
          this.clipboard = cloned;
          this.removeActiveObjects();
        });
      }
    }

    if (key === "v") {
      event.preventDefault();
      if (!this.clipboard || !this.canvas) return;
      this.clipboard.clone((clonedObj) => {
        this.canvas?.discardActiveObject();
        clonedObj.set({ left: (clonedObj.left || 0) + 12, top: (clonedObj.top || 0) + 12, evented: true });
        if (clonedObj.type === "activeSelection") {
          clonedObj.canvas = this.canvas;
          clonedObj.forEachObject((obj) => this.canvas?.add(obj));
          clonedObj.setCoords();
        } else {
          this.canvas?.add(clonedObj);
        }
        this.clipboard = clonedObj;
        this.canvas?.setActiveObject(clonedObj);
        this.canvas?.requestRenderAll();
        this.pushHistory();
      });
    }
  }

  private addText() {
    if (!this.canvas) return;
    const text = new fabric.IText("Editable text", {
      left: 64,
      top: 64,
      ...this.defaultTextStyle
    });
    this.canvas.add(text).setActiveObject(text);
    this.canvas.requestRenderAll();
    this.pushHistory();
  }

  private setTextStyle(style: { fontWeight?: string; fontStyle?: string; underline?: boolean; fill?: string; fontSize?: number }) {
    if (!this.canvas) return;
    const active = this.canvas.getActiveObject();
    let changedCanvas = false;

    if (style.fill) this.defaultTextStyle.fill = style.fill;
    if (style.fontSize) this.defaultTextStyle.fontSize = Number(style.fontSize) || 20;
    if (style.fontWeight) {
      this.defaultTextStyle.fontWeight = this.defaultTextStyle.fontWeight === "bold" ? "normal" : "bold";
    }
    if (style.fontStyle) {
      this.defaultTextStyle.fontStyle = this.defaultTextStyle.fontStyle === "italic" ? "normal" : "italic";
    }
    if (style.underline) {
      this.defaultTextStyle.underline = !this.defaultTextStyle.underline;
    }

    const applyStyle = (obj: fabric.Object | null | undefined) => {
      if (!isTextObject(obj)) return;
      changedCanvas = true;
      if (style.fontWeight) {
        obj.set({ fontWeight: obj.fontWeight === "bold" ? "normal" : "bold" });
      }
      if (style.fontStyle) {
        obj.set({ fontStyle: obj.fontStyle === "italic" ? "normal" : "italic" });
      }
      if (style.underline) {
        obj.set({ underline: !obj.underline });
      }
      if (style.fill) obj.set({ fill: style.fill });
      if (style.fontSize) obj.set({ fontSize: Number(style.fontSize) || 20 });
    };

    if (active?.type === "activeSelection") {
      active.getObjects().forEach((obj) => applyStyle(obj));
    } else {
      applyStyle(active);
      if (active && active.type === "i-text" && active.isEditing && style.fill) {
        active.setSelectionStyles({ fill: style.fill });
      }
    }

    this.canvas.requestRenderAll();
    if (active) active.setCoords();
    if (changedCanvas) this.pushHistory();
  }

  private setTextAlign(align: "left" | "center" | "right" | "justify") {
    if (!this.canvas) return;
    const active = this.canvas.getActiveObject();
    if (!isTextObject(active)) return;
    active.set({ textAlign: align });
    this.canvas.requestRenderAll();
    this.pushHistory();
  }

  private alignObjects(align: "left" | "center" | "right") {
    if (!this.canvas) return;
    const margin = 64;
    const pageWidth = this.canvas.getWidth();
    const selected = this.canvas.getActiveObjects();
    const targets = selected.length > 0 ? selected : this.canvas.getObjects();

    targets.forEach((obj) => {
      const width = obj.getScaledWidth();
      let left = obj.left ?? 0;
      if (align === "left") left = margin;
      if (align === "center") left = (pageWidth - width) / 2;
      if (align === "right") left = pageWidth - width - margin;
      obj.set({ left });
      if (isTextObject(obj)) {
        obj.set({ textAlign: align });
      }
      obj.setCoords();
    });

    this.canvas.requestRenderAll();
    this.pushHistory();
  }

  private addPlaceholder(key: string) {
    if (!this.canvas) return;
    const item = new fabric.IText(key, {
      left: 64,
      top: 120,
      fill: "#ea580c",
      fontSize: 20,
      fontFamily: "Georgia",
      fontStyle: "italic"
    });
    this.canvas.add(item).setActiveObject(item);
  }

  private addBOMTable(rows: Array<{ sku: string; name: string; qty: number; price: number }>) {
    if (!this.canvas) return;
    const text = new fabric.Textbox(createBOMText(rows), {
      left: 64,
      top: 260,
      width: 660,
      fontFamily: "Courier New",
      fontSize: 14,
      lineHeight: 1.3,
      fill: "#1f2937"
    });
    this.canvas.add(text).setActiveObject(text);
  }

  private addImage(dataUrl: string) {
    fabric.Image.fromURL(
      dataUrl,
      (img) => {
        if (!img) return;
        if (!this.canvas) return;
        img.scaleToWidth(300);
        img.set({ left: 64, top: 360 });
        this.canvas.add(img).setActiveObject(img);
        this.canvas.requestRenderAll();
        this.pushHistory();
      },
      { crossOrigin: "anonymous" }
    );
  }

  private copy() {
    if (!this.canvas) return;
    const active = this.canvas.getActiveObject();
    if (!active) return;
    active.clone((cloned) => {
      this.clipboard = cloned;
    });
  }

  private paste() {
    if (!this.canvas || !this.clipboard) return;
    this.clipboard.clone((clonedObj) => {
      this.canvas?.discardActiveObject();
      clonedObj.set({ left: (clonedObj.left || 0) + 12, top: (clonedObj.top || 0) + 12, evented: true });
      if (clonedObj.type === "activeSelection") {
        clonedObj.canvas = this.canvas;
        clonedObj.forEachObject((obj) => this.canvas?.add(obj));
        clonedObj.setCoords();
      } else {
        this.canvas?.add(clonedObj);
      }
      this.clipboard = clonedObj;
      this.canvas?.setActiveObject(clonedObj);
      this.canvas?.requestRenderAll();
    });
  }

  private duplicate() {
    this.copy();
    this.paste();
  }

  private undo() {
    if (!this.canvas) return;
    if (!this.hasPageChanges) return;
    if (this.historyIndex <= 0) return;
    this.historyIndex -= 1;
    this.isRestoring = true;
    this.canvas.loadFromJSON(JSON.parse(this.history[this.historyIndex]), () => {
      this.isRestoring = false;
      this.canvas?.renderAll();
    });
    if (this.historyIndex === 0) this.hasPageChanges = false;
    this.onPageChange(JSON.parse(this.history[this.historyIndex]));
  }

  private redo() {
    if (!this.canvas) return;
    if (this.historyIndex >= this.history.length - 1) return;
    this.historyIndex += 1;
    this.isRestoring = true;
    this.canvas.loadFromJSON(JSON.parse(this.history[this.historyIndex]), () => {
      this.isRestoring = false;
      this.canvas?.renderAll();
    });
    this.hasPageChanges = this.historyIndex > 0;
    this.onPageChange(JSON.parse(this.history[this.historyIndex]));
  }

  private deleteActive() {
    this.removeActiveObjects();
  }

  private async getPageImage() {
    if (!this.canvas) return "";
    return this.canvas.toDataURL({ multiplier: 2, format: "png" });
  }
}
