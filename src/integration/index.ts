import type { ProposalDocumentSnapshot } from "../types";
import { Store } from "../state/Store";
import { exportSnapshotAsPdf } from "../utils/documentAdapter";

export function createStoreFromSnapshot(snapshot?: ProposalDocumentSnapshot | null) {
  return new Store(snapshot ?? null);
}

export async function exportPdfFromSnapshot(snapshot: ProposalDocumentSnapshot) {
  await exportSnapshotAsPdf(snapshot);
}
