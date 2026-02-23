import { useEffect } from "react";
import { builderStore } from "../state/builderStore";

export function useAutosave() {
  useEffect(() => {
    localStorage.removeItem("modular-closet-pdf-draft");
    builderStore.pages = [{ id: crypto.randomUUID(), name: "Page 1", fabricJSON: null }];
    builderStore.activePageId = builderStore.pages[0].id;
    builderStore.lastSavedAt = null;
  }, []);
}
