import type { ExportOptions, Page, ProposalDocumentSnapshot, TableData } from "../types";
import { exportPagesAsPdf } from "./exportUtils";

type StoreLike = {
  projectId: string;
  projectName: string;
  customerName: string;
  designerEmail: string;
  date: string;
  mobileNo: string;
  userType: string;
  activePageId: string | null;
  tableData: TableData;
  pages: Page[];
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function buildDocumentSnapshot(source: StoreLike): ProposalDocumentSnapshot {
  return {
    schemaVersion: 1,
    activePageId: source.activePageId,
    meta: {
      projectId: source.projectId,
      projectName: source.projectName,
      customerName: source.customerName,
      designerEmail: source.designerEmail,
      date: source.date,
      mobileNo: source.mobileNo,
      userType: source.userType
    },
    tableData: clone(source.tableData),
    pages: clone(source.pages)
  };
}

export function buildExportOptionsFromSnapshot(snapshot: ProposalDocumentSnapshot): ExportOptions {
  return {
    headerText: "Modular Closets Renderings",
    headerProjectName: snapshot.meta.projectName || "",
    headerCustomerName: snapshot.meta.customerName || "",
    designerEmail: snapshot.meta.designerEmail || "",
    designerMobile: snapshot.meta.mobileNo || ""
  };
}

export async function exportSnapshotAsPdf(snapshot: ProposalDocumentSnapshot) {
  await exportPagesAsPdf(snapshot.pages, buildExportOptionsFromSnapshot(snapshot));
}

export function downloadSnapshotJson(snapshot: ProposalDocumentSnapshot) {
  const content = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `proposal-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
