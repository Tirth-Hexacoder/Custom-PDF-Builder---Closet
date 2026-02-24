import { makeAutoObservable } from "mobx";
import userData from "../data/userData.json";
import imageList from "../data/imageList.json";
import type { FabricJSON, Page, PendingCapture, ProjectImage, UserRecord } from "../types";

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

  constructor() {
    makeAutoObservable(this);
    this.loadUser();
    this.setupDefaultPages();
    this.activePageId = this.pages[0].id;
  }

  setupDefaultPages() {
    const images = this.getDefaultImageUrls();
    if (images.length === 0) {
      this.pages = [{ id: crypto.randomUUID(), name: "Page 1", fabricJSON: null }];
      return;
    }
    this.pages = images.map((url, index) => ({
      id: crypto.randomUUID(),
      name: `Page ${index + 1}`,
      fabricJSON: null,
      defaultImageUrl: url
    }));

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
}
