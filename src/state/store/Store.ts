import { makeAutoObservable } from "mobx";
import type {
  FabricJSON,
  Page,
  ProposalDocumentSnapshot,
  ReviewImage,
  ReviewItem,
  ReviewImageMetadata
} from "../../types";
import { buildDocumentSnapshot, rebuildPagesFromSnapshot } from "../../utils/downloadTab/documentAdapter";

const SESSION_DOC_KEY = "review_plugin_document_snapshot_v1";

export class Store {
  projectId = "";
  projectName = "";
  customerName = "";
  designerEmail = "";
  date = "";
  mobileNo = "";
  userType: "Designer" | "Retailer" | "retail" | "retailDesigner" = "Designer";
  images: ReviewImage[] = [];

  pages: Page[] = [];
  activePageId: string | null = null;

  // Boot order prefers provided document, then session restore, then default JSON bootstrap.
  // Load Initial Setup
  constructor(initialDocument?: ProposalDocumentSnapshot | null) {
    makeAutoObservable(this);
    const sessionDocument = this.readSessionSnapshot();
    if (initialDocument && this.loadSnapshot(initialDocument)) {
      return;
    }
    if (sessionDocument && this.loadSnapshot(sessionDocument)) {
      return;
    }
    const firstPage: Page = {
      id: crypto.randomUUID(),
      name: "Page 1",
      fabricJSON: null
    };
    this.pages = [firstPage];
    this.activePageId = firstPage.id;
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
    if (typeof window === "undefined" || !window.sessionStorage) return false;
    const snapshot = this.toDocumentSnapshot();
    window.sessionStorage.setItem(SESSION_DOC_KEY, JSON.stringify(snapshot));
    return true;
  }

  saveSnapshot() {
    try {
      return this.persistSessionSnapshot();
    } catch {
      return false;
    }
  }

  loadSnapshot(snapshot: ProposalDocumentSnapshot) {
    if (!snapshot || !Array.isArray(snapshot.pages) || !Array.isArray(snapshot.images)) {
      return false;
    }
    this.images = Array.isArray(snapshot.images) ? snapshot.images.map((img) => ({ ...img })) : [];

    if (snapshot.pages.length === 0 && this.images.length > 0) {
      const generated: ProposalDocumentSnapshot["pages"] = this.buildDefaultPagesFromImages(this.images);
      this.pages = rebuildPagesFromSnapshot({ images: this.images, pages: generated });
    } else {
      this.pages = rebuildPagesFromSnapshot(snapshot);
    }
    if (this.pages.length === 0) {
      this.pages = [{
        id: crypto.randomUUID(),
        name: "Page 1",
        fabricJSON: null
      }];
    }
    this.activePageId = this.pages[0]?.id ?? null;
    return true;
  }

  private buildDefaultPagesFromImages(images: ReviewImage[]): ProposalDocumentSnapshot["pages"] {
    const PAGE_W = 794;
    const PAGE_H = 1123;
    const margin = 40;
    const top = 100;
    const bottom = 70;
    const gap = 16;
    const contentW = PAGE_W - margin * 2;
    const contentH = PAGE_H - top - bottom;

    const getMeta = (img: ReviewImage) => (img.metadata || {}) as Record<string, unknown>;
    const findByType = (type: string) =>
      images.find((img) => String(img.type || getMeta(img).type || "").toLowerCase() === type.toLowerCase()) || null;

    const used = new Set<string>();
    const take = (img: ReviewImage | null) => {
      if (!img || !img.id) return null;
      if (used.has(img.id)) return null;
      used.add(img.id);
      return img;
    };

    const first2D = take(findByType("2D Default") || findByType("2D") || images[0] || null);
    const iso = take(findByType("Isometric"));
    const wall = take(findByType("Wall"));

    const remaining = images.filter((img) => img.id && !used.has(img.id));

    const makeImageItem = (imageId: string, x: number, y: number, w: number, h: number): ReviewItem => ({
      itemId: crypto.randomUUID(),
      type: "image",
      imageId,
      position: { x, y },
      size: { width: w, height: h },
      rotation: 0,
      scale: { x: 1, y: 1 },
      opacity: 1,
      locked: false,
      hidden: false
    });

    const pages: ProposalDocumentSnapshot["pages"] = [];

    if (first2D) {
      pages.push({
        pageId: crypto.randomUUID(),
        items: [
          makeImageItem(first2D.id as string, margin, top, contentW, Math.round(contentH * 0.5))
        ]
      });
    }

    if (iso || wall) {
      const halfH = Math.round((contentH - gap) / 2);
      const items: ReviewItem[] = [];
      if (iso) items.push(makeImageItem(iso.id as string, margin, top, contentW, halfH));
      if (wall) items.push(makeImageItem(wall.id as string, margin, top + halfH + gap, contentW, halfH));
      pages.push({ pageId: crypto.randomUUID(), items });
    }

    for (let i = 0; i < remaining.length; i += 4) {
      const chunk = remaining.slice(i, i + 4);
      const colW = Math.round((contentW - gap) / 2);
      const rowH = Math.round((contentH - gap) / 2);
      const positions = [
        { x: margin, y: top },
        { x: margin + colW + gap, y: top },
        { x: margin, y: top + rowH + gap },
        { x: margin + colW + gap, y: top + rowH + gap }
      ];
      pages.push({
        pageId: crypto.randomUUID(),
        items: chunk.map((img, idx) => makeImageItem(img.id as string, positions[idx].x, positions[idx].y, colW, rowH))
      });
    }

    if (pages.length === 0) {
      pages.push({ pageId: crypto.randomUUID(), items: [] });
    }
    return pages;
  }

  importSnapshot(snapshot: ProposalDocumentSnapshot) {
    const loaded = this.loadSnapshot(snapshot);
    if (!loaded) return false;
    return true;
  }

  // Set Active Page
  setActivePageId(id: string) {
    this.activePageId = id;
  }

  async addCapturedImage(dataUrl: string, metadata: ReviewImageMetadata = {}) {
    const id = crypto.randomUUID();
    const blob = await fetch(dataUrl).then((res) => res.blob());
    const blobUrl = URL.createObjectURL(blob);
    const image: ReviewImage = {
      id,
      imageUrl: "",
      blobUrl,
      metadata: { ...metadata }
    };
    this.images = [...this.images, image];
    return image;
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
