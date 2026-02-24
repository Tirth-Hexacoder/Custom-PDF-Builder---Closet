import { proxy } from "valtio";
import { DEFAULT_BOM } from "@closet/core";

export type FabricJSON = Record<string, unknown> | null;

export type Page = {
  id: string;
  name: string;
  fabricJSON: FabricJSON;
};

export type PendingCapture = {
  id: string;
  dataUrl: string;
};

type BuilderState = {
  project: Record<string, unknown>;
  pages: Page[];
  activePageId: string | null;
  pendingCaptures: PendingCapture[];
  bom: typeof DEFAULT_BOM;
  lastSavedAt: string | null;
};

export const builderStore = proxy<BuilderState>({
  project: {},
  pages: [{ id: crypto.randomUUID(), name: "Page 1", fabricJSON: null }],
  activePageId: null,
  pendingCaptures: [],
  bom: DEFAULT_BOM,
  lastSavedAt: null,
});

builderStore.activePageId = builderStore.pages[0].id;
