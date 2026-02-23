import { useLayoutEffect, useRef, useState } from "react";
import { useSnapshot } from "valtio";
import {
  addPage,
  builderStore,
  deleteActivePage,
  setPageFabricJSON,
  type PendingCapture
} from "../../state/builderStore";
import { FabricCanvas, type FabricCanvasHandle } from "./FabricCanvas";

export function EditorTab() {
  const snap = useSnapshot(builderStore);
  const canvasRef = useRef<FabricCanvasHandle | null>(null);
  const processedCaptureIdsRef = useRef<Set<string>>(new Set());
  const pendingCaptureBufferRef = useRef<PendingCapture[]>([]);
  const [canvasReady, setCanvasReady] = useState(false);
  const [fontSize, setFontSize] = useState(24);
  const [fontColor, setFontColor] = useState("#1f2937");

  const activePage = snap.pages.find((p) => p.id === snap.activePageId) || snap.pages[0];

  useLayoutEffect(() => {
    if (!canvasReady || !canvasRef.current || snap.pendingCaptures.length === 0) return;
    const firstPageId = builderStore.pages[0]?.id;
    if (!firstPageId) return;
    if (builderStore.activePageId !== firstPageId) {
      const queue = [...snap.pendingCaptures];
      builderStore.pendingCaptures = [];
      pendingCaptureBufferRef.current.push(...queue);
      builderStore.activePageId = firstPageId;
      return;
    }
    const queue = [...snap.pendingCaptures];
    builderStore.pendingCaptures = [];
    queue.forEach((item) => {
      if (!item?.dataUrl) return;
      if (processedCaptureIdsRef.current.has(item.id)) return;
      processedCaptureIdsRef.current.add(item.id);
      canvasRef.current?.addImage(item.dataUrl);
    });
  }, [canvasReady, snap.pendingCaptures.length]);

  useLayoutEffect(() => {
    const firstPageId = builderStore.pages[0]?.id;
    if (!canvasReady || !canvasRef.current || !firstPageId) return;
    if (builderStore.activePageId !== firstPageId) return;
    if (pendingCaptureBufferRef.current.length === 0) return;
    const queue = [...pendingCaptureBufferRef.current];
    pendingCaptureBufferRef.current = [];
    queue.forEach((item) => {
      if (!item?.dataUrl) return;
      if (processedCaptureIdsRef.current.has(item.id)) return;
      processedCaptureIdsRef.current.add(item.id);
      canvasRef.current?.addImage(item.dataUrl);
    });
  }, [canvasReady, snap.activePageId]);

  return (
    <div className="editor-container">
      {/* Editor toolbar */}
      <div className="editor-toolbar">
        <div className="toolbar-group">
          <button className="tool-btn" onClick={() => canvasRef.current?.addText()}>
            <i className="fa-solid fa-font"></i>
            <span>Text</span>
          </button>

          <div className="toolbar-divider"></div>

          <button className="tool-btn" onClick={() => canvasRef.current?.setTextStyle({ fontWeight: "bold" })}>
            <i className="fa-solid fa-bold"></i>
          </button>
          <button className="tool-btn" onClick={() => canvasRef.current?.setTextStyle({ fontStyle: "italic" })}>
            <i className="fa-solid fa-italic"></i>
          </button>

          <div className="toolbar-divider"></div>

          <div className="toolbar-group" style={{ gap: '4px' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted)' }}>SIZE</span>
            <input
              type="number"
              className="input"
              style={{ width: '60px', height: '32px', padding: '0 8px', fontSize: '0.8rem' }}
              value={fontSize}
              onChange={(e) => {
                const val = Number(e.target.value);
                setFontSize(val);
                canvasRef.current?.setTextStyle({ fontSize: val });
              }}
            />
          </div>

          <div className="toolbar-divider"></div>

          <div className="toolbar-group" style={{ gap: '4px' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted)' }}>COLOR</span>
            <div style={{ position: 'relative', width: '28px', height: '28px', borderRadius: '4px', background: fontColor, border: '1px solid var(--border)', cursor: 'pointer' }}>
              <input
                type="color"
                value={fontColor}
                style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer', left: 0, top: 0 }}
                onChange={(e) => {
                  setFontColor(e.target.value);
                  canvasRef.current?.setTextStyle({ fill: e.target.value });
                }}
              />
            </div>
          </div>

          <div className="toolbar-divider"></div>

          <button className="tool-btn" style={{ color: '#ef4444' }} onClick={() => canvasRef.current?.deleteActive()}>
            <i className="fa-solid fa-trash-can"></i>
            <span>Delete</span>
          </button>
        </div>

        <div className="toolbar-group">
          <button className="tool-btn" onClick={() => canvasRef.current?.undo()} title="Undo">
            <i className="fa-solid fa-rotate-left"></i>
          </button>
          <button className="tool-btn" onClick={() => canvasRef.current?.redo()} title="Redo">
            <i className="fa-solid fa-rotate-right"></i>
          </button>
        </div>
      </div>

      <div className="editor-main">
        {/* Left page previews */}
        <aside className="page-previews">
          <div className="page-previews-list">
            <div className="preview-header">PAGES</div>
            {snap.pages.map((p, idx) => (
              <div
                key={p.id}
                className={`preview-item ${p.id === snap.activePageId ? "active" : ""}`}
                onClick={() => (builderStore.activePageId = p.id)}
              >
                <div className="preview-img">
                  <i className="fa-solid fa-file-lines preview-file-icon"></i>
                </div>
                <div className="preview-label">{idx + 1}</div>
              </div>
            ))}
          </div>

          <div className="page-previews-actions">
          <button className="add-page-btn" onClick={() => addPage(false)}>
            <i className="fa-solid fa-plus"></i>
            <span>New Page</span>
          </button>
          <button
            className="add-page-btn"
            onClick={deleteActivePage}
            disabled={snap.pages.length <= 1}
            title={snap.pages.length <= 1 ? "At least one page is required" : "Delete current page"}
          >
            <i className="fa-solid fa-trash"></i>
            <span>Delete Page</span>
          </button>
          </div>
        </aside>

        {/* Main Editor Viewport */}
        <div className="editor-viewport">
          <div className="canvas-container-outer">
            <FabricCanvas
              ref={canvasRef}
              page={activePage}
              onReady={setCanvasReady}
              onPageChange={(json) => setPageFabricJSON(activePage?.id, json)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
