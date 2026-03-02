// Create the Table From JSON Data

import type { FabricJSON, Page, TableData, TableRow } from "../types";

export const BOM_PAGE_WIDTH = 794;
export const BOM_PAGE_HEIGHT = 1123;
export const BOM_TABLE_TOP = 140;
export const BOM_TABLE_BOTTOM = 120;
export const BOM_HEADER_HEIGHT = 16;
export const BOM_COL_WIDTHS = [150, 330, 90, 50, 80];
export const BOM_TABLE_WIDTH = BOM_COL_WIDTHS.reduce((sum, width) => sum + width, 0);
export const BOM_TABLE_X = (BOM_PAGE_WIDTH - BOM_TABLE_WIDTH) / 2;
export const BOM_FONT_SIZE = 11;

export function wrapBomTextByChars(text: string, maxChars: number) {
  const words = (text || "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i += 1) {
    const next = `${current} ${words[i]}`;
    if (next.length > maxChars) {
      lines.push(current);
      current = words[i];
    } else {
      current = next;
    }
  }
  lines.push(current);
  return lines;
}

export function getBomRowHeight(row: TableRow) {
  const lines = wrapBomTextByChars(row.description || "", 42).length;
  return Math.max(16, lines * 12 + 4);
}

export function chunkBomRows(rows: TableRow[]) {
  const chunks: TableRow[][] = [];
  let current: TableRow[] = [];
  let y = BOM_TABLE_TOP + BOM_HEADER_HEIGHT;
  const pageEnd = BOM_PAGE_HEIGHT - BOM_TABLE_BOTTOM;

  rows.forEach((row) => {
    const height = getBomRowHeight(row);
    if (y + height > pageEnd && current.length > 0) {
      chunks.push(current);
      current = [];
      y = BOM_TABLE_TOP + BOM_HEADER_HEIGHT;
    }
    current.push(row);
    y += height;
  });

  if (current.length > 0) chunks.push(current);
  if (chunks.length === 0) chunks.push([]);
  return chunks;
}

function makeRect(left: number, top: number, width: number, height: number, fill = "rgba(0,0,0,0)") {
  return {
    type: "rect",
    left,
    top,
    width,
    height,
    fill,
    stroke: "#111827",
    strokeWidth: 1,
    selectable: false,
    evented: false,
    hasControls: false,
    lockMovementX: true,
    lockMovementY: true,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
    data: { id: "bom-layout" }
  };
}

function makeHeaderText(text: string, left: number, top: number) {
  return {
    type: "text",
    text,
    left,
    top,
    fontFamily: "Inter",
    fontSize: 11,
    fontWeight: "700",
    fill: "#0f172a",
    selectable: false,
    evented: false,
    data: { id: "bom-layout" }
  };
}

function makeCellText(text: string, left: number, top: number, width: number, bold = false, align: "left" | "center" | "right" = "left") {
  return {
    type: "textbox",
    text,
    left,
    top,
    width,
    styles: {},
    fontFamily: "Inter",
    fontSize: FONT_SIZE,
    fontWeight: bold ? "700" : "400",
    fill: "#111827",
    editable: false,
    textAlign: align,
    selectable: false,
    evented: false,
    hasControls: false,
    lockMovementX: true,
    lockMovementY: true,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
    data: { id: "bom-cell-text" }
  };
}

function buildPageJson(rows: TableRow[], grandTotal?: string, includeTotal = false): FabricJSON {
  const objects: Array<Record<string, unknown>> = [];
  let y = BOM_TABLE_TOP;

  let x = BOM_TABLE_X;
  const headers = ["Part", "Description", "Unit Price", "Qty", "Total"];
  headers.forEach((header, index) => {
    objects.push(makeRect(x, y, BOM_COL_WIDTHS[index], BOM_HEADER_HEIGHT, "#d4d4d4"));
    objects.push(makeHeaderText(header, x + 4, y + 3));
    x += BOM_COL_WIDTHS[index];
  });
  y += BOM_HEADER_HEIGHT;

  rows.forEach((row) => {
    const rowHeight = getBomRowHeight(row);
    const descLines = wrapBomTextByChars(row.description || "", 42).join("\n");
    let colX = BOM_TABLE_X;
    BOM_COL_WIDTHS.forEach((width) => {
      objects.push(makeRect(colX, y, width, rowHeight));
      colX += width;
    });

    objects.push(makeCellText(row.part || "", BOM_TABLE_X + 4, y + 2, BOM_COL_WIDTHS[0] - 8, !!row.isBold));
    objects.push(makeCellText(descLines, BOM_TABLE_X + BOM_COL_WIDTHS[0] + 4, y + 2, BOM_COL_WIDTHS[1] - 8, !!row.isBold));
    objects.push(makeCellText(String(row.unitPrice || ""), BOM_TABLE_X + BOM_COL_WIDTHS[0] + BOM_COL_WIDTHS[1] + 4, y + 2, BOM_COL_WIDTHS[2] - 8, !!row.isBold));
    objects.push(makeCellText(String(row.qty ?? ""), BOM_TABLE_X + BOM_COL_WIDTHS[0] + BOM_COL_WIDTHS[1] + BOM_COL_WIDTHS[2] + 4, y + 2, BOM_COL_WIDTHS[3] - 8, !!row.isBold, "center"));
    objects.push(makeCellText(String(row.total || ""), BOM_TABLE_X + BOM_COL_WIDTHS[0] + BOM_COL_WIDTHS[1] + BOM_COL_WIDTHS[2] + BOM_COL_WIDTHS[3] + 4, y + 2, BOM_COL_WIDTHS[4] - 8, !!row.isBold));
    y += rowHeight;
  });

  if (includeTotal) {
    const leftWidth = BOM_COL_WIDTHS[0] + BOM_COL_WIDTHS[1] + BOM_COL_WIDTHS[2] + BOM_COL_WIDTHS[3];
    const rowHeight = 16;
    objects.push(makeRect(BOM_TABLE_X, y, leftWidth, rowHeight));
    objects.push(makeRect(BOM_TABLE_X + leftWidth, y, BOM_COL_WIDTHS[4], rowHeight));
    objects.push(makeHeaderText("Total:", BOM_TABLE_X + leftWidth - 44, y + 3));
    objects.push(makeCellText(String(grandTotal || ""), BOM_TABLE_X + leftWidth + 4, y + 2, BOM_COL_WIDTHS[4] - 8, true));
  }

  return {
    version: "5.3.0",
    objects
  } as FabricJSON;
}

export function createBomPages(data: TableData): Page[] {
  const rows = data?.rows || [];
  const chunks = chunkBomRows(rows);
  return chunks.map((chunk, index) => ({
    id: crypto.randomUUID(),
    name: `BOM ${index + 1}`,
    fabricJSON: buildPageJson(chunk, data.grandTotal, index === chunks.length - 1)
  }));
}
