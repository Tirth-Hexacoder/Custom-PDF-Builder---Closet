import { proxy } from "valtio";
import { DEFAULT_BOM } from "@closet/core";
import { toast } from "react-hot-toast";

export const builderStore = proxy({
  project: {
    
  },
  pages: [{ id: crypto.randomUUID(), name: "Page 1", fabricJSON: null }],
  activePageId: null,
  captures: [],
  pendingCaptures: [],
  bom: DEFAULT_BOM,
  lastSavedAt: null,
});

builderStore.activePageId = builderStore.pages[0].id;

export function addCapture(dataUrl) {
  const capture = { id: crypto.randomUUID(), dataUrl, createdAt: Date.now() };
  builderStore.captures.unshift(capture);
  builderStore.pendingCaptures = [...builderStore.pendingCaptures, { id: capture.id, dataUrl }];
  toast.success("Scene captured!");
}

export function setPageFabricJSON(pageId, json) {
  const idx = builderStore.pages.findIndex((p) => p.id === pageId);
  if (idx >= 0) builderStore.pages[idx].fabricJSON = json;
}

export function addPage(copyOfActive = false) {
  const active = builderStore.pages.find((p) => p.id === builderStore.activePageId);
  const page = {
    id: crypto.randomUUID(),
    name: `Page ${builderStore.pages.length + 1}`,
    fabricJSON: copyOfActive && active ? active.fabricJSON : null
  };
  builderStore.pages.push(page);
  builderStore.activePageId = page.id;
  toast.success(copyOfActive ? "Page duplicated" : "New page added");
}

export function deleteActivePage() {
  if (builderStore.pages.length <= 1) return;
  const idx = builderStore.pages.findIndex((p) => p.id === builderStore.activePageId);
  builderStore.pages.splice(idx, 1);
  builderStore.activePageId = builderStore.pages[Math.max(0, idx - 1)].id;
  toast.success("Page deleted");
}
