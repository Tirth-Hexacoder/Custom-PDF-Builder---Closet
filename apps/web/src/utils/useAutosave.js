import { useEffect } from "react";
import { builderStore } from "../state/builderStore";
import { storageAdapter } from "../integration/adapters";

export function useAutosave() {
  useEffect(() => {
    storageAdapter.clearDraft?.();
    builderStore.pages = [{ id: crypto.randomUUID(), name: "Page 1", fabricJSON: null }];
    builderStore.activePageId = builderStore.pages[0].id;
    builderStore.lastSavedAt = null;
  }, []);
}
