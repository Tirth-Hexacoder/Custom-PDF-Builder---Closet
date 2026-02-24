import { toast } from "react-hot-toast";
import type { FabricJSON } from "../state/builderStore";
import { builderStore } from "../state/builderStore";

export function addCapture(dataUrl: string) {
  const captureId = crypto.randomUUID();
  builderStore.pendingCaptures = [...builderStore.pendingCaptures, { id: captureId, dataUrl }];
  toast.success("Scene captured!");
}

export function setPageFabricJSON(pageId: string | null | undefined, json: FabricJSON) {
  if (!pageId) return;
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
