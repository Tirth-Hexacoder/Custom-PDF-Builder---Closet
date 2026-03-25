import type { ProposalDocumentSnapshot } from "../types";
import { Store } from "../state/Store";
import { exportStoreAsPdf } from "../utils/downloadTab/documentAdapter";

export function createStoreFromSnapshot(snapshot?: ProposalDocumentSnapshot | null) {
  return new Store(snapshot ?? null);
}

export async function exportPdfFromSnapshot(snapshot: ProposalDocumentSnapshot) {
  const store = new Store(snapshot);
  await exportStoreAsPdf(store);
}
