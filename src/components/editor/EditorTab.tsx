import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import type { FabricCanvasHandle, Page, PendingCapture } from "../../types";
import { useStore } from "../../state/Root";
import { FabricCanvas } from "./FabricCanvas";
import { renderPagePreview } from "../../utils/pagePreviewUtils";

export const EditorTab = observer(function EditorTab() {

  const store = useStore();

  const canvasRef = useRef<FabricCanvasHandle | null>(null);

  const processedCaptureIdsRef = useRef<Set<string>>(new Set());
  const pendingCaptureBufferRef = useRef<PendingCapture[]>([]);
  const dragIndexRef = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRafRef = useRef<number | null>(null);
  const autoScrollVelocityRef = useRef(0);
  const previewQueueRef = useRef<string[]>([]);
  const previewProcessingRef = useRef(false);
  const previewSourceRef = useRef<Record<string, { fabricJSON: Page["fabricJSON"]; defaultImageUrl?: string }>>({});

  const firstPageRenderRef = useRef(true);

  const [canvasReady, setCanvasReady] = useState(false);
  const [isPageSwitching, setIsPageSwitching] = useState(false);
  const [pagePreviewMap, setPagePreviewMap] = useState<Record<string, string>>({});
  const [fontSize, setFontSize] = useState(24);
  const [fontColor, setFontColor] = useState("#1f2937");
  const [textAlign, setTextAlign] = useState<"left" | "center" | "right">("left");
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);

  const activePage = store.pages.find((p) => p.id === store.activePageId) || store.pages[0];
  const activePageIndex = Math.max(
    0,
    store.pages.findIndex((p) => p.id === activePage?.id)
  );

  // Adding Image on Canvas (Page) and Processed Capture Array
  const addCaptureImages = (queue: PendingCapture[]) => {
    queue.forEach((item) => {
      if (!item?.dataUrl) return;
      if (processedCaptureIdsRef.current.has(item.id)) return;
      processedCaptureIdsRef.current.add(item.id);
      canvasRef.current?.addImage(item.dataUrl);
    });
  };

  // Taken Screeshot Transfered from Pending Capture Array to Queue (Which will be added to Canvas (Page))
  // If Page is not First Page then Images Still Added into First Page
  useEffect(() => {
    if (!canvasReady || !canvasRef.current || store.pendingCaptures.length === 0) return;
    const firstPageId = store.pages[0]?.id;
    if (!firstPageId) return;
    if (store.activePageId !== firstPageId) {
      const queue = [...store.pendingCaptures];
      store.pendingCaptures = [];
      pendingCaptureBufferRef.current.push(...queue);
      store.setActivePageId(firstPageId);
      return;
    }
    const queue = [...store.pendingCaptures];
    store.pendingCaptures = [];
    addCaptureImages(queue);
  }, [canvasReady, store.pendingCaptures.length]);

  // Adding All Pending Capture Array's Images to First Page Only
  useEffect(() => {
    const firstPageId = store.pages[0]?.id;
    if (!canvasReady || !canvasRef.current || !firstPageId) return;
    if (store.activePageId !== firstPageId) return;
    if (pendingCaptureBufferRef.current.length === 0) return;
    const queue = [...pendingCaptureBufferRef.current];
    pendingCaptureBufferRef.current = [];
    addCaptureImages(queue);
  }, [canvasReady, store.activePageId]);

  // Page Switching UI Update on Left Panel
  useEffect(() => {
    if (firstPageRenderRef.current) {
      firstPageRenderRef.current = false;
      return;
    }
    setIsPageSwitching(true);
    const timer = window.setTimeout(() => setIsPageSwitching(false), 220);
    return () => window.clearTimeout(timer);
  }, [store.activePageId]);

  const startAutoScroll = () => {
    if (autoScrollRafRef.current !== null) return;
    const tick = () => {
      const list = listRef.current;
      if (!list) {
        autoScrollRafRef.current = null;
        return;
      }
      if (autoScrollVelocityRef.current !== 0) {
        list.scrollTop += autoScrollVelocityRef.current;
      }
      autoScrollRafRef.current = window.requestAnimationFrame(tick);
    };
    autoScrollRafRef.current = window.requestAnimationFrame(tick);
  };

  const stopAutoScroll = () => {
    autoScrollVelocityRef.current = 0;
    if (autoScrollRafRef.current !== null) {
      window.cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  };

  useEffect(() => {
    const runQueue = async () => {
      if (previewProcessingRef.current) return;
      previewProcessingRef.current = true;
      while (previewQueueRef.current.length > 0) {
        const pageId = previewQueueRef.current.shift()!;
        const page = store.pages.find((p) => p.id === pageId);
        if (!page) continue;
        try {
          const dataUrl = await renderPagePreview(page);
          setPagePreviewMap((prev) => ({ ...prev, [page.id]: dataUrl }));
        } catch {
          // Ignore preview render errors and keep editor responsive.
        }
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
      previewProcessingRef.current = false;
    };

    const currentIds = new Set(store.pages.map((p) => p.id));
    setPagePreviewMap((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((id) => {
        if (!currentIds.has(id)) delete next[id];
      });
      return next;
    });

    store.pages.forEach((page) => {
      const previous = previewSourceRef.current[page.id];
      const changed =
        !previous ||
        previous.fabricJSON !== page.fabricJSON ||
        previous.defaultImageUrl !== page.defaultImageUrl;
      previewSourceRef.current[page.id] = {
        fabricJSON: page.fabricJSON,
        defaultImageUrl: page.defaultImageUrl
      };
      if (!changed) return;
      if (!previewQueueRef.current.includes(page.id)) {
        previewQueueRef.current.push(page.id);
      }
    });

    void runQueue();
  }, [store.pages]);

  useEffect(() => {
    return () => stopAutoScroll();
  }, []);

  return (
    <div className="editor-container">
      <div className="editor-toolbar">
        <div className="toolbar-group">
          <button
            className="tool-btn"
            onClick={() =>
              canvasRef.current?.addText({
                bold: isBold,
                italic: isItalic,
                underline: isUnderline,
                align: textAlign
              })
            }
          >
            <i className="fa-solid fa-font"></i>
            <span>Text</span>
          </button>

          <div className="toolbar-divider"></div>

          <button
            className={`tool-btn ${isBold ? "active" : ""}`}
            onClick={() => {
              setIsBold((prev) => !prev);
              canvasRef.current?.setTextStyle({ fontWeight: "bold" });
            }}
          >
            <i className="fa-solid fa-bold"></i>
          </button>
          <button
            className={`tool-btn ${isItalic ? "active" : ""}`}
            onClick={() => {
              setIsItalic((prev) => !prev);
              canvasRef.current?.setTextStyle({ fontStyle: "italic" });
            }}
          >
            <i className="fa-solid fa-italic"></i>
          </button>
          <button
            className={`tool-btn ${isUnderline ? "active" : ""}`}
            onClick={() => {
              setIsUnderline((prev) => !prev);
              canvasRef.current?.setTextStyle({ underline: true });
            }}
          >
            <i className="fa-solid fa-underline"></i>
          </button>

          <div className="toolbar-divider"></div>

          <div className="toolbar-group font-size-group">
            <span className="toolbar-label">SIZE</span>
            <div className="font-size-control">
              <button
                className="font-size-btn"
                onClick={() => {
                  const next = Math.max(8, fontSize - 2);
                  setFontSize(next);
                  canvasRef.current?.setTextStyle({ fontSize: next });
                }}
                aria-label="Decrease font size"
              >
                <i className="fa-solid fa-minus"></i>
              </button>
              <input
                type="number"
                className="font-size-input"
                value={fontSize}
                min={8}
                max={120}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  const next = Number.isFinite(val) ? val : fontSize;
                  setFontSize(next);
                  canvasRef.current?.setTextStyle({ fontSize: next });
                }}
              />
              <button
                className="font-size-btn"
                onClick={() => {
                  const next = Math.min(120, fontSize + 2);
                  setFontSize(next);
                  canvasRef.current?.setTextStyle({ fontSize: next });
                }}
                aria-label="Increase font size"
              >
                <i className="fa-solid fa-plus"></i>
              </button>
            </div>
          </div>

          <div className="toolbar-divider"></div>

          <div className="toolbar-group" role="group" aria-label="Text alignment">
            <button
              className={`tool-btn icon-only ${textAlign === "left" ? "active" : ""}`}
              onClick={() => {
                setTextAlign("left");
                canvasRef.current?.alignObjects("left");
              }}
              aria-label="Align left"
            >
              <i className="fa-solid fa-align-left"></i>
            </button>
            <button
              className={`tool-btn icon-only ${textAlign === "center" ? "active" : ""}`}
              onClick={() => {
                setTextAlign("center");
                canvasRef.current?.alignObjects("center");
              }}
              aria-label="Align center"
            >
              <i className="fa-solid fa-align-center"></i>
            </button>
            <button
              className={`tool-btn icon-only ${textAlign === "right" ? "active" : ""}`}
              onClick={() => {
                setTextAlign("right");
                canvasRef.current?.alignObjects("right");
              }}
              aria-label="Align right"
            >
              <i className="fa-solid fa-align-right"></i>
            </button>
          </div>

          <div className="toolbar-divider"></div>

          <div className="toolbar-group" style={{ gap: '4px' }}>
            <span className="toolbar-label">COLOR</span>
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
        <aside className="page-previews">
          <div
            className="page-previews-list"
            ref={listRef}
            onDragOver={(e) => {
              const list = listRef.current;
              if (!list) return;
              const rect = list.getBoundingClientRect();
              const y = e.clientY - rect.top;
              const edgeSize = 72;
              const maxSpeed = 18;
              let velocity = 0;
              if (y < edgeSize) {
                velocity = -Math.ceil(((edgeSize - y) / edgeSize) * maxSpeed);
              } else if (rect.height - y < edgeSize) {
                velocity = Math.ceil(((edgeSize - (rect.height - y)) / edgeSize) * maxSpeed);
              }
              autoScrollVelocityRef.current = velocity;
              if (velocity !== 0) startAutoScroll();
            }}
            onDragLeave={() => {
              autoScrollVelocityRef.current = 0;
            }}
            onDrop={() => {
              stopAutoScroll();
            }}
          >
            <div className="preview-header">PAGES</div>
            {store.pages.map((p, idx) => (
              <div className="preview-block" key={p.id}>
                <div
                  className={`preview-item ${p.id === store.activePageId ? "active" : ""}`}
                  onClick={() => store.setActivePageId(p.id)}
                  draggable
                  onDragStart={() => {
                    dragIndexRef.current = idx;
                  }}
                  onDragEnd={() => {
                    dragIndexRef.current = null;
                    stopAutoScroll();
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const fromIndex = dragIndexRef.current;
                    dragIndexRef.current = null;
                    if (fromIndex === null) return;
                    store.movePage(fromIndex, idx);
                  }}
                >
                  <div className="preview-img">
                    {pagePreviewMap[p.id] ? (
                      <img src={pagePreviewMap[p.id]} alt={`Preview ${idx + 1}`} className="preview-thumb" />
                    ) : (
                      <i className="fa-solid fa-file-lines preview-file-icon"></i>
                    )}
                  </div>
                  <div className="preview-label">{idx + 1}</div>
                </div>
                {idx < store.pages.length - 1 && (
                  <button
                    type="button"
                    className="preview-swap-btn"
                    title={`Swap Page ${idx + 1} with Page ${idx + 2}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      store.swapAdjacentPages(idx);
                    }}
                  >
                    <i className="fa-solid fa-arrows-rotate"></i>
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="page-previews-actions">
          <button className="add-page-btn" onClick={() => store.addPage(false)}>
            <i className="fa-solid fa-plus"></i>
            <span>New Page</span>
          </button>
          <button
            className="add-page-btn"
            onClick={() => store.deleteActivePage()}
            disabled={store.pages.length <= 1}
            title={store.pages.length <= 1 ? "At least one page is required" : "Delete current page"}
          >
            <i className="fa-solid fa-trash"></i>
            <span>Delete Page</span>
          </button>
          </div>
        </aside>

        <div className="editor-viewport">
          <div className={`canvas-container-outer ${isPageSwitching ? "is-page-switching" : ""}`}>

            {/* Actual Canvas (Page) */}
            <FabricCanvas
              ref={canvasRef}
              page={activePage}
              onReady={setCanvasReady}
              onPageChange={(pageId, json) => store.setPageFabricJSON(pageId, json)}
              onTextSelectionChange={(state) => {
                setIsBold(state.bold);
                setIsItalic(state.italic);
                setIsUnderline(state.underline);
                setTextAlign(state.align);
              }}
              headerText="Modular Closets Renderings"
              headerProjectName={store.projectName}
              headerCustomerName={store.customerName}
              footerLogoUrl="https://modularstudio.modularclosets-apps.com/design/assets/logo/logo2.svg"
              pageNumber={activePageIndex + 1}
              totalPages={store.pages.length}
              designerEmail={store.designerEmail}
              designerMobile={store.mobileNo}
            />
          </div>
        </div>

      </div>
    </div>
  );
});
