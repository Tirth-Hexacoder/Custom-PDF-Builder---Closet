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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function validateProposalDocumentSnapshot(value: unknown): value is ProposalDocumentSnapshot {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== 1) return false;
  if (!("activePageId" in value)) return false;

  const meta = value.meta;
  const tableData = value.tableData;
  const pages = value.pages;

  if (!isRecord(meta)) return false;
  if (!isRecord(tableData)) return false;
  if (!Array.isArray(tableData.rows)) return false;
  if (!Array.isArray(pages) || pages.length === 0) return false;

  return pages.every((page) => {
    if (!isRecord(page)) return false;
    if (typeof page.id !== "string" || page.id.length === 0) return false;
    if (typeof page.name !== "string") return false;
    return true;
  });
}

export function parseSnapshotJsonText(text: string) {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!validateProposalDocumentSnapshot(parsed)) {
      return { snapshot: null as ProposalDocumentSnapshot | null, error: "Invalid snapshot format." };
    }
    return { snapshot: parsed as ProposalDocumentSnapshot, error: "" };
  } catch {
    return { snapshot: null as ProposalDocumentSnapshot | null, error: "Invalid JSON file." };
  }
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
    designerMobile: snapshot.meta.mobileNo || "",
    tableData: clone(snapshot.tableData)
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
