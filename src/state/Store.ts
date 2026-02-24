import { makeAutoObservable } from "mobx";
import userData from "../data/userData.json";
import imageList from "../data/imageList.json";
import tableData from "../data/table.json";
import type { FabricJSON, Page, PendingCapture, ProjectImage, TableData, UserRecord } from "../types";
import { createBomPages } from "../utils/bomTableUtils";

export class Store {
  projectId = "";
  projectName = "";
  customerName = "";
  designerEmail = "";
  date = "";
  mobileNo = "";
  images: ProjectImage[] = [];

  pages: Page[] = [];
  activePageId: string | null = null;
  pendingCaptures: PendingCapture[] = [];
  tableData: TableData = { rows: [], grandTotal: "" };

  constructor() {
    makeAutoObservable(this);
    this.loadUser();
    this.setupTableData();
    this.setupDefaultPages();
    this.activePageId = this.pages[0].id;
  }

  setupDefaultPages() {
    const images = this.getDefaultImageUrls();
    const imagePages = images.map((url, index) => ({
      id: crypto.randomUUID(),
      name: `Page ${index + 1}`,
      fabricJSON: null,
      defaultImageUrl: url
    }));
    const bomPages = createBomPages(this.tableData);
    this.pages = [...imagePages, ...bomPages];

  }

  getDefaultImageUrls() {
    return imageList as string[];
  }

  loadUser() {
    const firstUser = (userData as { users: UserRecord[] }).users[0];
    if (!firstUser) return;
    this.projectId = firstUser.projectId;
    this.projectName = firstUser.projectName;
    this.customerName = firstUser.customerName;
    this.designerEmail = firstUser.designerEmail;
    this.date = firstUser.date;
    this.mobileNo = firstUser.mobileNo;
    this.images = firstUser.images ?? [];
  }

  setupTableData() {
    const source = tableData as TableData;
    this.tableData = {
      rows: (source.rows || []).map((row) => ({ ...row })),
      grandTotal: source.grandTotal || ""
    };
  }

  setActivePageId(id: string) {
    this.activePageId = id;
  }

  addCapture(dataUrl: string) {
    const captureId = crypto.randomUUID();
    this.pendingCaptures = [...this.pendingCaptures, { id: captureId, dataUrl }];
  }

  setPageFabricJSON(pageId: string | null | undefined, json: FabricJSON) {
    if (!pageId) return;
    const idx = this.pages.findIndex((p) => p.id === pageId);
    if (idx >= 0) {
      this.pages[idx].fabricJSON = json ? JSON.parse(JSON.stringify(json)) : null;
    }
  }

  addPage(copyOfActive = false) {
    const active = this.pages.find((p) => p.id === this.activePageId);
    const page: Page = {
      id: crypto.randomUUID(),
      name: `Page ${this.pages.length + 1}`,
      fabricJSON: copyOfActive && active?.fabricJSON ? JSON.parse(JSON.stringify(active.fabricJSON)) : null
    };
    this.pages.push(page);
    this.activePageId = page.id;
  }

  deleteActivePage() {
    if (this.pages.length <= 1) return;
    const idx = this.pages.findIndex((p) => p.id === this.activePageId);
    this.pages.splice(idx, 1);
    this.activePageId = this.pages[Math.max(0, idx - 1)].id;
  }

  updateTableCell(index: number, field: "part" | "description" | "unitPrice" | "qty" | "total", value: string) {
    const row = this.tableData.rows[index];
    if (!row) return;
    if (field === "qty") {
      row.qty = value;
      return;
    }
    row[field] = value;
  }

  toggleTableRowBold(index: number) {
    const row = this.tableData.rows[index];
    if (!row) return;
    row.isBold = !row.isBold;
  }

  addTableRow() {
    this.tableData.rows.push({
      part: "",
      description: "",
      unitPrice: "",
      qty: "",
      total: ""
    });
  }

  removeTableRow(index: number) {
    if (index < 0 || index >= this.tableData.rows.length) return;
    this.tableData.rows.splice(index, 1);
  }

  setTableGrandTotal(value: string) {
    this.tableData.grandTotal = value;
  }
}
