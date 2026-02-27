import { makeAutoObservable } from "mobx";
import userData from "../data/userData.json";
import imageList from "../data/imageList.json";
import tableData from "../data/table.json";
import type {
  FabricJSON,
  Page,
  PendingCapture,
  ProjectImage,
  ProposalDocumentSnapshot,
  SceneImageInput,
  SceneImageType,
  TableData,
  UserRecord
} from "../types";
import { createBomPages } from "../utils/bomTableUtils";
import { buildDocumentSnapshot } from "../utils/documentAdapter";

const SESSION_DOC_KEY = "pdf_builder_document_snapshot_v1";
const DESIGNER_IMAGE_ORDER: SceneImageType[] = ["2D Default", "2D", "Stretched", "Isometric", "3D", "Wall"];
const NON_DESIGNER_IMAGE_ORDER: SceneImageType[] = ["Stretched", "Isometric", "3D", "2D Default", "2D", "Wall"];
const IMAGE_TYPE_CYCLE: SceneImageType[] = ["2D Default", "2D", "Stretched", "Isometric", "3D", "Wall"];
const DESIGNER_GRID_MAX_PER_PAGE = 6;
const WALL_GRID_MAX_PER_PAGE = 4;

export class Store {
  projectId = "";
  projectName = "";
  customerName = "";
  designerEmail = "";
  date = "";
  mobileNo = "";
  userType: "Designer" | "Retailer" | "retail" | "retailDesigner" = "Designer";
  images: ProjectImage[] = [];
  imageURL: SceneImageInput[] = [];

  pages: Page[] = [];
  activePageId: string | null = null;
  pendingCaptures: PendingCapture[] = [];
  tableData: TableData = { rows: [], grandTotal: "" };

  // Load Initial Setup
  constructor(initialDocument?: ProposalDocumentSnapshot | null) {
    makeAutoObservable(this);
    const sessionDocument = this.readSessionSnapshot();
    if (initialDocument && this.loadSnapshot(initialDocument)) {
      this.persistSessionSnapshot();
      return;
    }
    if (sessionDocument && this.loadSnapshot(sessionDocument)) {
      this.persistSessionSnapshot();
      return;
    }
    this.loadUser();
    this.setupTableData();
    this.setupDefaultPages();
    this.activePageId = this.pages[0].id;
    this.persistSessionSnapshot();
  }

  private readSessionSnapshot() {
    if (typeof window === "undefined" || !window.sessionStorage) return null;
    const raw = window.sessionStorage.getItem(SESSION_DOC_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ProposalDocumentSnapshot;
    } catch {
      return null;
    }
  }

  private persistSessionSnapshot() {
    if (typeof window === "undefined" || !window.sessionStorage) return;
    const snapshot = this.toDocumentSnapshot();
    window.sessionStorage.setItem(SESSION_DOC_KEY, JSON.stringify(snapshot));
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
    this.userType = (snapshot.meta?.userType as "Designer" | "Retailer" | "retail" | "retailDesigner") || "Designer";
    this.tableData = {
      rows: (snapshot.tableData?.rows || []).map((row) => ({ ...row })),
      grandTotal: snapshot.tableData?.grandTotal || ""
    };
    const imageByUrl = new Map(this.getDefaultImageUrls().map((item) => [item.url, item]));
    this.pages = snapshot.pages.map((page, index) => {
      const fromDefaultImages = Array.isArray(page.defaultImages)
        ? page.defaultImages
          .map((item) => (item?.url ? imageByUrl.get(item.url) || item : null))
          .filter((item): item is SceneImageInput => !!item)
        : [];
      const singleCandidate = page.defaultImage
        ? (page.defaultImage.url ? imageByUrl.get(page.defaultImage.url) || page.defaultImage : null)
        : (page.defaultImageUrl ? imageByUrl.get(page.defaultImageUrl) : null);
      const defaultImages = fromDefaultImages.length > 0
        ? fromDefaultImages
        : (singleCandidate ? [singleCandidate] : []);
      const defaultImage = defaultImages[0] || undefined;
      return {
        id: page.id || crypto.randomUUID(),
        name: page.name || `Page ${index + 1}`,
        fabricJSON: page.fabricJSON ? JSON.parse(JSON.stringify(page.fabricJSON)) : null,
        defaultImageUrl: defaultImage?.url || page.defaultImageUrl,
        defaultImage,
        defaultImages,
        defaultLayout: page.defaultLayout
      };
    });
    const activeExists = this.pages.some((page) => page.id === snapshot.activePageId);
    this.activePageId = activeExists ? snapshot.activePageId : this.pages[0]?.id ?? null;
    return true;
  }

  // Setup Default Pages as Per Number of Images
  setupDefaultPages() {
    this.imageURL = this.getOrderedDefaultImages();
    const isDesigner = this.userType.toLowerCase() === "designer";
    const imagePages: Page[] = isDesigner
      ? this.buildDesignerImagePages(this.imageURL)
      : this.imageURL.map((image) => ({
        id: crypto.randomUUID(),
        name: "",
        fabricJSON: null,
        defaultImageUrl: image.url,
        defaultImage: image,
        defaultImages: [image],
        defaultLayout: "single"
      }));
    imagePages.forEach((page, index) => {
      page.name = `Page ${index + 1}`;
    });
    const bomPages = createBomPages(this.tableData);
    this.pages = [...imagePages, ...bomPages];

  }

  private buildDesignerImagePages(images: SceneImageInput[]) {
    const pages: Page[] = [];
    const wallImages: SceneImageInput[] = [];
    const nonWallImages: SceneImageInput[] = [];
    let default2DImage: SceneImageInput | null = null;

    images.forEach((image) => {
      if (image.type === "Wall") {
        wallImages.push(image);
        return;
      }
      if (!default2DImage && image.type === "2D Default") {
        default2DImage = image;
        return;
      }
      nonWallImages.push(image);
    });

    if (default2DImage) {
      const firstPageGridChunk = nonWallImages.slice(0, DESIGNER_GRID_MAX_PER_PAGE);
      const firstPageImages = [default2DImage, ...firstPageGridChunk];
      pages.push({
        id: crypto.randomUUID(),
        name: "",
        fabricJSON: null,
        defaultImageUrl: default2DImage.url,
        defaultImage: default2DImage,
        defaultImages: firstPageImages,
        defaultLayout: firstPageGridChunk.length > 0 ? "top-grid" : "single"
      });
    }

    const nonWallStartIndex = default2DImage ? DESIGNER_GRID_MAX_PER_PAGE : 0;
    for (let index = nonWallStartIndex; index < nonWallImages.length; index += DESIGNER_GRID_MAX_PER_PAGE) {
      const chunk = nonWallImages.slice(index, index + DESIGNER_GRID_MAX_PER_PAGE);
      pages.push({
        id: crypto.randomUUID(),
        name: "",
        fabricJSON: null,
        defaultImageUrl: chunk[0].url,
        defaultImage: chunk[0],
        defaultImages: chunk,
        defaultLayout: chunk.length === 1 ? "single" : "grid-2-col"
      });
    }

    for (let index = 0; index < wallImages.length; index += WALL_GRID_MAX_PER_PAGE) {
      const wallChunk = wallImages.slice(index, index + WALL_GRID_MAX_PER_PAGE);
      pages.push({
        id: crypto.randomUUID(),
        name: "",
        fabricJSON: null,
        defaultImageUrl: wallChunk[0]?.url,
        defaultImage: wallChunk[0],
        defaultImages: wallChunk,
        defaultLayout: "wall-grid"
      });
    }

    return pages;
  }

  // Get Image List From Json Data
  getDefaultImageUrls() {
    const source = imageList as unknown;
    if (!Array.isArray(source)) return [];
    return source
      .map((item, index) => {
        if (typeof item === "string") {
          return {
            url: item,
            type: IMAGE_TYPE_CYCLE[index % IMAGE_TYPE_CYCLE.length],
            notes: [],
            baseUrl: ""
          } satisfies SceneImageInput;
        }
        if (!item || typeof item !== "object") return null;
        const candidate = item as Partial<SceneImageInput>;
        const url = typeof candidate.url === "string" ? candidate.url : "";
        if (!url) return null;
        const type = IMAGE_TYPE_CYCLE.includes(candidate.type as SceneImageType)
          ? (candidate.type as SceneImageType)
          : IMAGE_TYPE_CYCLE[index % IMAGE_TYPE_CYCLE.length];
        return {
          url,
          type,
          notes: Array.isArray(candidate.notes) ? candidate.notes : [],
          baseUrl: typeof candidate.baseUrl === "string" ? candidate.baseUrl : ""
        } satisfies SceneImageInput;
      })
      .filter((item): item is SceneImageInput => !!item);
  }

  private getOrderedDefaultImages() {
    const list = this.getDefaultImageUrls();
    const isDesigner = this.userType.toLowerCase() === "designer";
    const order = isDesigner ? DESIGNER_IMAGE_ORDER : NON_DESIGNER_IMAGE_ORDER;
    const orderIndex = new Map(order.map((type, index) => [type, index]));

    return [...list].sort((a, b) => {
      const aIdx = orderIndex.get(a.type);
      const bIdx = orderIndex.get(b.type);
      if (aIdx === undefined && bIdx === undefined) return 0;
      if (aIdx === undefined) return 1;
      if (bIdx === undefined) return -1;
      return aIdx - bIdx;
    });
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
    this.userType = firstUser.userType || "Designer";
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
    this.persistSessionSnapshot();
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
      this.persistSessionSnapshot();
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
    this.persistSessionSnapshot();
  }

  // Remove The Page From Pages Array of Store
  deleteActivePage() {
    if (this.pages.length <= 1) return;
    const idx = this.pages.findIndex((p) => p.id === this.activePageId);
    this.pages.splice(idx, 1);
    this.activePageId = this.pages[Math.max(0, idx - 1)].id;
    this.persistSessionSnapshot();
  }

  // Swap current page index with the next page index
  swapAdjacentPages(index: number) {
    if (index < 0 || index >= this.pages.length - 1) return;
    const next = index + 1;
    const temp = this.pages[index];
    this.pages[index] = this.pages[next];
    this.pages[next] = temp;
    this.persistSessionSnapshot();
  }

  // Move page from one position to another
  movePage(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= this.pages.length) return;
    if (toIndex < 0 || toIndex >= this.pages.length) return;
    const [moved] = this.pages.splice(fromIndex, 1);
    this.pages.splice(toIndex, 0, moved);
    this.persistSessionSnapshot();
  }
}
