// Create the Table From JSON Data

import type { FabricJSON, Page, TableData, TableRow } from "../types";

const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1123;
const TABLE_TOP = 140;
const TABLE_BOTTOM = 120;
const HEADER_HEIGHT = 16;
const COL_WIDTHS = [150, 330, 90, 50, 80];
const TABLE_WIDTH = COL_WIDTHS.reduce((sum, width) => sum + width, 0);
const TABLE_X = (PAGE_WIDTH - TABLE_WIDTH) / 2;
const FONT_SIZE = 11;

function wrapTextByChars(text: string, maxChars: number) {
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

function getRowHeight(row: TableRow) {
  const lines = wrapTextByChars(row.description || "", 42).length;
  return Math.max(16, lines * 12 + 4);
}

function chunkRows(rows: TableRow[]) {
  const chunks: TableRow[][] = [];
  let current: TableRow[] = [];
  let y = TABLE_TOP + HEADER_HEIGHT;
  const pageEnd = PAGE_HEIGHT - TABLE_BOTTOM;

  rows.forEach((row) => {
    const height = getRowHeight(row);
    if (y + height > pageEnd && current.length > 0) {
      chunks.push(current);
      current = [];
      y = TABLE_TOP + HEADER_HEIGHT;
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
  let y = TABLE_TOP;

  let x = TABLE_X;
  const headers = ["Part", "Description", "Unit Price", "Qty", "Total"];
  headers.forEach((header, index) => {
    objects.push(makeRect(x, y, COL_WIDTHS[index], HEADER_HEIGHT, "#d4d4d4"));
    objects.push(makeHeaderText(header, x + 4, y + 3));
    x += COL_WIDTHS[index];
  });
  y += HEADER_HEIGHT;

  rows.forEach((row) => {
    const rowHeight = getRowHeight(row);
    const descLines = wrapTextByChars(row.description || "", 42).join("\n");
    let colX = TABLE_X;
    COL_WIDTHS.forEach((width) => {
      objects.push(makeRect(colX, y, width, rowHeight));
      colX += width;
    });

    objects.push(makeCellText(row.part || "", TABLE_X + 4, y + 2, COL_WIDTHS[0] - 8, !!row.isBold));
    objects.push(makeCellText(descLines, TABLE_X + COL_WIDTHS[0] + 4, y + 2, COL_WIDTHS[1] - 8, !!row.isBold));
    objects.push(makeCellText(String(row.unitPrice || ""), TABLE_X + COL_WIDTHS[0] + COL_WIDTHS[1] + 4, y + 2, COL_WIDTHS[2] - 8, !!row.isBold));
    objects.push(makeCellText(String(row.qty ?? ""), TABLE_X + COL_WIDTHS[0] + COL_WIDTHS[1] + COL_WIDTHS[2] + 4, y + 2, COL_WIDTHS[3] - 8, !!row.isBold, "center"));
    objects.push(makeCellText(String(row.total || ""), TABLE_X + COL_WIDTHS[0] + COL_WIDTHS[1] + COL_WIDTHS[2] + COL_WIDTHS[3] + 4, y + 2, COL_WIDTHS[4] - 8, !!row.isBold));
    y += rowHeight;
  });

  if (includeTotal) {
    const leftWidth = COL_WIDTHS[0] + COL_WIDTHS[1] + COL_WIDTHS[2] + COL_WIDTHS[3];
    const rowHeight = 16;
    objects.push(makeRect(TABLE_X, y, leftWidth, rowHeight));
    objects.push(makeRect(TABLE_X + leftWidth, y, COL_WIDTHS[4], rowHeight));
    objects.push(makeHeaderText("Total:", TABLE_X + leftWidth - 44, y + 3));
    objects.push(makeCellText(String(grandTotal || ""), TABLE_X + leftWidth + 4, y + 2, COL_WIDTHS[4] - 8, true));
  }

  return {
    version: "5.3.0",
    objects
  } as FabricJSON;
}

export function createBomPages(data: TableData): Page[] {
  const rows = data?.rows || [];
  const chunks = chunkRows(rows);
  return chunks.map((chunk, index) => ({
    id: crypto.randomUUID(),
    name: `BOM ${index + 1}`,
    fabricJSON: buildPageJson(chunk, data.grandTotal, index === chunks.length - 1)
  }));
}
