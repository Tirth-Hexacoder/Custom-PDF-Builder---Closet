import { makeAutoObservable } from "mobx";
import userData from "../data/userData.json";

export type FabricJSON = Record<string, unknown> | null;

export type Page = {
  id: string;
  name: string;
  fabricJSON: FabricJSON;
};

export type PendingCapture = {
  id: string;
  dataUrl: string;
};

export type ProjectImage = {
  id: string;
  projectId: string;
  url: string;
};

type UserRecord = {
  projectId: string;
  projectName: string;
  customerName: string;
  designerEmail: string;
  date: string;
  mobileNo: string;
  images: ProjectImage[];
};

export class Store {
  projectId = "";
  projectName = "";
  customerName = "";
  designerEmail = "";
  date = "";
  mobileNo = "";
  images: ProjectImage[] = [];

  pages: Page[] = [{ id: crypto.randomUUID(), name: "Page 1", fabricJSON: null }];
  activePageId: string | null = null;
  pendingCaptures: PendingCapture[] = [];

  constructor() {
    makeAutoObservable(this);
    this.loadUser();
    this.activePageId = this.pages[0].id;
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
    if (idx >= 0) this.pages[idx].fabricJSON = json;
  }

  addPage(copyOfActive = false) {
    const active = this.pages.find((p) => p.id === this.activePageId);
    const page: Page = {
      id: crypto.randomUUID(),
      name: `Page ${this.pages.length + 1}`,
      fabricJSON: copyOfActive && active ? active.fabricJSON : null
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
