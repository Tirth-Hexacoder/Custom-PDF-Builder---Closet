import { useRef } from "react";
import type { ChangeEvent } from "react";
import toast from "react-hot-toast";
import type { Store } from "../../../state/Store";
import { parseSnapshotJsonText } from "../../../utils/downloadTab/documentAdapter";

// Keep file-import side effects out of EditorTab so toolbar code stays readable.
export function useSnapshotImport(store: Store) {
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const triggerImportPicker = () => {
    importInputRef.current?.click();
  };

  const onImportJsonFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    const content = await file.text();
    const { snapshot, error } = parseSnapshotJsonText(content);
    if (!snapshot) {
      toast.error(error || "Failed to parse snapshot JSON.");
      return;
    }

    const current = store.toDocumentSnapshot();
    const isDifferentProject =
      (snapshot.meta.projectId || "") !== (current.meta.projectId || "") ||
      (snapshot.meta.projectName || "") !== (current.meta.projectName || "") ||
      (snapshot.meta.customerName || "") !== (current.meta.customerName || "");

    if (isDifferentProject) {
      toast.error("Imported file appears to be from a different project.");
    }

    const loaded = store.importSnapshot(snapshot);
    if (!loaded) {
      toast.error("Unable to load this JSON snapshot.");
      return;
    }

    toast.success("JSON snapshot imported successfully.");
  };

  return {
    importInputRef,
    triggerImportPicker,
    onImportJsonFile
  };
}
