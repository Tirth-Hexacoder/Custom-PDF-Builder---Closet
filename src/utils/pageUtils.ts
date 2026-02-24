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

export class PageCanvasController {
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

  constructor({ host, page, onPageChange, onReady }: PageCanvasControllerOptions) {
    this.onPageChange = onPageChange;
    this.onReady = onReady;
    this.handleDeleteKey = (event: KeyboardEvent) => this.onDeleteKey(event);
    this.handleClipboardShortcuts = (event: KeyboardEvent) => this.onClipboardShortcuts(event);
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
    canvas.setZoom(1);
    canvas.setWidth(A4_PX.width);
    canvas.setHeight(A4_PX.height);

    canvas.on("object:added", this.pushHistory);
    canvas.on("object:modified", this.pushHistory);
    canvas.on("object:removed", this.pushHistory);
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
