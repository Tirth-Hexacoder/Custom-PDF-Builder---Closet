import { A4_PX } from "@closet/core";
import { fabric } from "fabric";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { FabricJSON, Page } from "../../state/builderStore";

function createBOMText(rows: Array<{ sku: string; name: string; qty: number; price: number }>) {
  const lines = ["BILL OF MATERIALS", "-----------------"];
  rows.forEach((r, i) => lines.push(`${i + 1}. ${r.sku} | ${r.name} | Qty: ${r.qty} | $${r.price}`));
  return lines.join("\n");
}

function isTextObject(obj: fabric.Object | null | undefined) {
  return obj && ["i-text", "textbox", "text"].includes(obj.type);
}

export type FabricCanvasHandle = {
  addText: () => void;
  setTextStyle: (style: { fontWeight?: string; fontStyle?: string; fill?: string; fontSize?: number }) => void;
  setTextAlign: (align: "left" | "center" | "right" | "justify") => void;
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

type FabricCanvasProps = {
  page?: Page;
  onPageChange: (json: FabricJSON) => void;
  onReady?: (ready: boolean) => void;
};

export const FabricCanvas = forwardRef<FabricCanvasHandle, FabricCanvasProps>(function FabricCanvas(
  { page, onPageChange, onReady },
  ref
) {
  const hostRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<fabric.Canvas | null>(null);
  const clipboardRef = useRef<fabric.Object | null>(null);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const hasPageChangesRef = useRef(false);
  const isRestoringRef = useRef(false);
  const hasHandledInitialPageRef = useRef(false);
  const defaultTextStyleRef = useRef({
    fill: "#1f2937",
    fontSize: 24,
    fontFamily: "Georgia",
    fontWeight: "normal",
    fontStyle: "normal"
  });

  const seedHistoryFromCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const json = JSON.stringify(canvas.toJSON(["data"]));
    historyRef.current = [json];
    historyIndexRef.current = 0;
    hasPageChangesRef.current = false;
  };

  const pushHistory = ({ markChange = true }: { markChange?: boolean } = {}) => {
    const canvas = canvasRef.current;
    if (!canvas || isRestoringRef.current) return;
    const json = JSON.stringify(canvas.toJSON(["data"]));
    const latest = historyRef.current[historyIndexRef.current];
    if (latest === json) return;
    const list = historyRef.current.slice(0, historyIndexRef.current + 1);
    list.push(json);
    historyRef.current = list.slice(-50);
    historyIndexRef.current = historyRef.current.length - 1;
    if (markChange) hasPageChangesRef.current = true;
    onPageChange(JSON.parse(json));
  };

  const removeActiveObjects = () => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const activeObjects = canvas.getActiveObjects();
    if (activeObjects.length > 0) {
      canvas.discardActiveObject();
      activeObjects.forEach((obj) => canvas.remove(obj));
      canvas.requestRenderAll();
      pushHistory();
      return true;
    }
    const activeObject = canvas.getActiveObject();
    if (activeObject) {
      canvas.discardActiveObject();
      canvas.remove(activeObject);
      canvas.requestRenderAll();
      pushHistory();
      return true;
    }
    return false;
  };

  useEffect(() => {
    const canvas = new fabric.Canvas(hostRef.current, {
      width: A4_PX.width,
      height: A4_PX.height,
      backgroundColor: "#ffffff",
      preserveObjectStacking: true,
      selection: true,
      selectionColor: 'rgba(37, 99, 235, 0.1)',
      selectionBorderColor: '#2563eb',
      selectionLineWidth: 1
    });
    canvasRef.current = canvas;

    // Professional selection styling
    fabric.Object.prototype.transparentCorners = false;
    fabric.Object.prototype.cornerColor = '#2563eb';
    fabric.Object.prototype.cornerStyle = 'circle';
    fabric.Object.prototype.cornerSize = 8;
    fabric.Object.prototype.borderColor = '#2563eb';
    fabric.Object.prototype.padding = 4;
    canvas.setZoom(1);
    canvas.setWidth(A4_PX.width);
    canvas.setHeight(A4_PX.height);

    canvas.on("object:added", pushHistory);
    canvas.on("object:modified", pushHistory);
    canvas.on("object:removed", pushHistory);
    onReady?.(true);

    if (page?.fabricJSON) {
      isRestoringRef.current = true;
      canvas.loadFromJSON(page.fabricJSON, () => {
        isRestoringRef.current = false;
        canvas.renderAll();
        seedHistoryFromCanvas();
      });
    } else {
      seedHistoryFromCanvas();
    }

    const handleDeleteKey = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target;
      const targetTag = target?.tagName?.toLowerCase();
      const isTypingField =
        target?.isContentEditable ||
        targetTag === "input" ||
        targetTag === "textarea" ||
        targetTag === "select";
      const active = canvas.getActiveObject();
      if (isTypingField || (isTextObject(active) && active.isEditing)) return;
      if (removeActiveObjects()) event.preventDefault();
    };

    const handleClipboardShortcuts = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const modKey = isMac ? event.metaKey : event.ctrlKey;
      if (!modKey) return;
      const key = event.key.toLowerCase();
      const target = event.target;
      const targetTag = target?.tagName?.toLowerCase();
      const isTypingField =
        target?.isContentEditable ||
        targetTag === "input" ||
        targetTag === "textarea" ||
        targetTag === "select";
      const active = canvas.getActiveObject();
      if (isTypingField || (isTextObject(active) && active.isEditing)) return;

      if (key === "c") {
        event.preventDefault();
        clipboardRef.current = null;
        const activeObj = canvas.getActiveObject();
        if (activeObj) {
          activeObj.clone((cloned) => {
            clipboardRef.current = cloned;
          });
        }
      }

      if (key === "x") {
        event.preventDefault();
        const activeObj = canvas.getActiveObject();
        if (activeObj) {
          activeObj.clone((cloned) => {
            clipboardRef.current = cloned;
            removeActiveObjects();
          });
        }
      }

      if (key === "v") {
        event.preventDefault();
        const canvasRefCurrent = canvasRef.current;
        if (!clipboardRef.current || !canvasRefCurrent) return;
        clipboardRef.current.clone((clonedObj) => {
          canvasRefCurrent.discardActiveObject();
          clonedObj.set({ left: (clonedObj.left || 0) + 12, top: (clonedObj.top || 0) + 12, evented: true });
          if (clonedObj.type === "activeSelection") {
            clonedObj.canvas = canvasRefCurrent;
            clonedObj.forEachObject((obj) => canvasRefCurrent.add(obj));
            clonedObj.setCoords();
          } else {
            canvasRefCurrent.add(clonedObj);
          }
          clipboardRef.current = clonedObj;
          canvasRefCurrent.setActiveObject(clonedObj);
          canvasRefCurrent.requestRenderAll();
          pushHistory();
        });
      }
    };
    window.addEventListener("keydown", handleDeleteKey);
    window.addEventListener("keydown", handleClipboardShortcuts);

    return () => {
      canvas.dispose();
      onReady?.(false);
      window.removeEventListener("keydown", handleDeleteKey);
      window.removeEventListener("keydown", handleClipboardShortcuts);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !page) return;
    if (!hasHandledInitialPageRef.current) {
      hasHandledInitialPageRef.current = true;
      return;
    }
    isRestoringRef.current = true;
    canvas.clear();
    canvas.setBackgroundColor("#fff", canvas.renderAll.bind(canvas));
    if (page.fabricJSON) {
      canvas.loadFromJSON(page.fabricJSON, () => {
        isRestoringRef.current = false;
        canvas.renderAll();
        seedHistoryFromCanvas();
      });
    } else {
      isRestoringRef.current = false;
      canvas.renderAll();
      seedHistoryFromCanvas();
    }
  }, [page?.id]);

  useImperativeHandle(ref, () => ({
    addText() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const text = new fabric.IText("Editable text", {
        left: 64,
        top: 64,
        ...defaultTextStyleRef.current
      });
      canvas.add(text).setActiveObject(text);
      canvas.requestRenderAll();
      pushHistory();
    },
    setTextStyle(style) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const active = canvas.getActiveObject();
      let changedCanvas = false;

      if (style.fill) defaultTextStyleRef.current.fill = style.fill;
      if (style.fontSize) defaultTextStyleRef.current.fontSize = Number(style.fontSize) || 20;
      if (style.fontWeight) {
        defaultTextStyleRef.current.fontWeight = defaultTextStyleRef.current.fontWeight === "bold" ? "normal" : "bold";
      }
      if (style.fontStyle) {
        defaultTextStyleRef.current.fontStyle = defaultTextStyleRef.current.fontStyle === "italic" ? "normal" : "italic";
      }

      const applyStyle = (obj) => {
        if (!isTextObject(obj)) return;
        changedCanvas = true;
        if (style.fontWeight) {
          obj.set({ fontWeight: obj.fontWeight === "bold" ? "normal" : "bold" });
        }
        if (style.fontStyle) {
          obj.set({ fontStyle: obj.fontStyle === "italic" ? "normal" : "italic" });
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

      canvas.requestRenderAll();
      if (active) active.setCoords();
      if (changedCanvas) pushHistory();
    },
    setTextAlign(align) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const active = canvas.getActiveObject();
      if (!isTextObject(active)) return;
      active.set({ textAlign: align });
      canvas.requestRenderAll();
      pushHistory();
    },
    addPlaceholder(key) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const item = new fabric.IText(key, {
        left: 64,
        top: 120,
        fill: "#ea580c",
        fontSize: 20,
        fontFamily: "Georgia",
        fontStyle: "italic"
      });
      canvas.add(item).setActiveObject(item);
    },
    addBOMTable(rows) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const text = new fabric.Textbox(createBOMText(rows), {
        left: 64,
        top: 260,
        width: 660,
        fontFamily: "Courier New",
        fontSize: 14,
        lineHeight: 1.3,
        fill: "#1f2937"
      });
      canvas.add(text).setActiveObject(text);
    },
    addImage(dataUrl) {
      fabric.Image.fromURL(dataUrl, (img) => {
        if (!img) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        img.scaleToWidth(300);
        img.set({ left: 64, top: 360 });
        canvas.add(img).setActiveObject(img);
        canvas.requestRenderAll();
        pushHistory();
      }, { crossOrigin: "anonymous" });
    },
    copy() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const active = canvas.getActiveObject();
      if (!active) return;
      active.clone((cloned) => {
        clipboardRef.current = cloned;
      });
    },
    paste() {
      const canvas = canvasRef.current;
      if (!clipboardRef.current) return;
      clipboardRef.current.clone((clonedObj) => {
        canvas.discardActiveObject();
        clonedObj.set({ left: (clonedObj.left || 0) + 12, top: (clonedObj.top || 0) + 12, evented: true });
        if (clonedObj.type === "activeSelection") {
          clonedObj.canvas = canvas;
          clonedObj.forEachObject((obj) => canvas.add(obj));
          clonedObj.setCoords();
        } else {
          canvas.add(clonedObj);
        }
        clipboardRef.current = clonedObj;
        canvas.setActiveObject(clonedObj);
        canvas.requestRenderAll();
      });
    },
    duplicate() {
      this.copy();
      this.paste();
    },
    undo() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (!hasPageChangesRef.current) return;
      if (historyIndexRef.current <= 0) return;
      historyIndexRef.current -= 1;
      isRestoringRef.current = true;
      canvas.loadFromJSON(JSON.parse(historyRef.current[historyIndexRef.current]), () => {
        isRestoringRef.current = false;
        canvas.renderAll();
      });
      if (historyIndexRef.current === 0) hasPageChangesRef.current = false;
      onPageChange(JSON.parse(historyRef.current[historyIndexRef.current]));
    },
    redo() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (historyIndexRef.current >= historyRef.current.length - 1) return;
      historyIndexRef.current += 1;
      isRestoringRef.current = true;
      canvas.loadFromJSON(JSON.parse(historyRef.current[historyIndexRef.current]), () => {
        isRestoringRef.current = false;
        canvas.renderAll();
      });
      hasPageChangesRef.current = historyIndexRef.current > 0;
      onPageChange(JSON.parse(historyRef.current[historyIndexRef.current]));
    },
    deleteActive() {
      removeActiveObjects();
    },
    async getPageImage() {
      const canvas = canvasRef.current;
      if (!canvas) return "";
      return canvas.toDataURL({ multiplier: 2, format: "png" });
    }
  }));

  return <canvas ref={hostRef} />;
});
