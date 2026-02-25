import { makeAutoObservable } from "mobx";
import userData from "../data/userData.json";
import imageList from "../data/imageList.json";
import tableData from "../data/table.json";
import type { FabricJSON, Page, PendingCapture, ProjectImage, ProposalDocumentSnapshot, TableData, UserRecord } from "../types";
import { createBomPages } from "../utils/bomTableUtils";
import { buildDocumentSnapshot } from "../utils/documentAdapter";

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

  // Load Initial Setup
  constructor(initialDocument?: ProposalDocumentSnapshot | null) {
    makeAutoObservable(this);
    if (initialDocument && this.loadSnapshot(initialDocument)) {
      return;
    }
    this.loadUser();
    this.setupTableData();
    this.setupDefaultPages();
    this.activePageId = this.pages[0].id;
  }

  loadSnapshot(snapshot: ProposalDocumentSnapshot) {
    if (!snapshot || snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.pages) || snapshot.pages.length === 0) {
      return false;
    }
    this.projectId = snapshot.meta?.projectId || "";
    this.projectName = snapshot.meta?.projectName || "";
    this.customerName = snapshot.meta?.customerName || "";
    this.designerEmail = snapshot.meta?.designerEmail || "";
    this.date = snapshot.meta?.date || "";
    this.mobileNo = snapshot.meta?.mobileNo || "";
    this.tableData = {
      rows: (snapshot.tableData?.rows || []).map((row) => ({ ...row })),
      grandTotal: snapshot.tableData?.grandTotal || ""
    };
    this.pages = snapshot.pages.map((page, index) => ({
      id: page.id || crypto.randomUUID(),
      name: page.name || `Page ${index + 1}`,
      fabricJSON: page.fabricJSON ? JSON.parse(JSON.stringify(page.fabricJSON)) : null,
      defaultImageUrl: page.defaultImageUrl
    }));
    const activeExists = this.pages.some((page) => page.id === snapshot.activePageId);
    this.activePageId = activeExists ? snapshot.activePageId : this.pages[0]?.id ?? null;
    return true;
  }

  // Setup Default Pages as Per Number of Images
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

  // Get Image List From Json Data
  getDefaultImageUrls() {
    return imageList as string[];
  }

  // Load User Data From Json
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

  // Get Table (BOM) Data From Json
  setupTableData() {
    const source = tableData as TableData;
    this.tableData = {
      rows: (source.rows || []).map((row) => ({ ...row })),
      grandTotal: source.grandTotal || ""
    };
  }

  // Set Active Page
  setActivePageId(id: string) {
    this.activePageId = id;
  }

  // Add Capture Into Pending Capture Array
  addCapture(dataUrl: string) {
    const captureId = crypto.randomUUID();
    this.pendingCaptures = [...this.pendingCaptures, { id: captureId, dataUrl }];
  }

  // Set Stored Data Of The Canvas (Page)
  setPageFabricJSON(pageId: string | null | undefined, json: FabricJSON) {
    if (!pageId) return;
    const idx = this.pages.findIndex((p) => p.id === pageId);
    if (idx >= 0) {
      this.pages[idx].fabricJSON = json ? JSON.parse(JSON.stringify(json)) : null;
    }
  }

  toDocumentSnapshot(): ProposalDocumentSnapshot {
    return buildDocumentSnapshot(this);
  }

  // Create & Add Page Into Pages Array of Store
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

  // Remove The Page From Pages Array of Store
  deleteActivePage() {
    if (this.pages.length <= 1) return;
    const idx = this.pages.findIndex((p) => p.id === this.activePageId);
    this.pages.splice(idx, 1);
    this.activePageId = this.pages[Math.max(0, idx - 1)].id;
  }

  // Swap current page index with the next page index
  swapAdjacentPages(index: number) {
    if (index < 0 || index >= this.pages.length - 1) return;
    const next = index + 1;
    const temp = this.pages[index];
    this.pages[index] = this.pages[next];
    this.pages[next] = temp;
  }

  // Move page from one position to another
  movePage(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= this.pages.length) return;
    if (toIndex < 0 || toIndex >= this.pages.length) return;
    const [moved] = this.pages.splice(fromIndex, 1);
    this.pages.splice(toIndex, 0, moved);
  }
}
