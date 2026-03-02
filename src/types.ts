import type { fabric } from 'fabric';

export type FabricJSON = Record<string, unknown> | null;

export type Page = {
  id: string;
  name: string;
  fabricJSON: FabricJSON;
  defaultImageUrl?: string;
  defaultImage?: SceneImageInput;
  defaultImages?: SceneImageInput[];
  defaultLayout?: "single" | "grid-2-col" | "hero-three" | "stack" | "top-grid" | "wall-grid";
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

export type SceneImageType =
  | "2D"
  | "2D Default"
  | "3D"
  | "Stretched"
  | "Wall"
  | "Isometric";

export type SceneImageNote = {
  id: string;
  text: string;
  xPercent: number;
  yPercent: number;
  fontSize: number;
  fontColor: string;
  fontType: string;
};

export type SceneImageInput = {
  url: string;
  type: SceneImageType;
  notes: SceneImageNote[];
  baseUrl: string;
};

export type UserRecord = {
  projectId: string;
  projectName: string;
  customerName: string;
  designerEmail: string;
  date: string;
  mobileNo: string;
  userType?: "Designer" | "Retailer" | "retail" | "retailDesigner";
  images: ProjectImage[];
};

export type FabricCanvasHandle = {
  addText: (
    initialStyle?: { bold?: boolean; italic?: boolean; underline?: boolean; align?: "left" | "center" | "right" },
    at?: { left: number; top: number }
  ) => void;
  setTextStyle: (style: { fontWeight?: string; fontStyle?: string; underline?: boolean; fill?: string; fontSize?: number }) => void;
  setOpacity: (opacity: number) => void;
  alignObjects: (align: "left" | "center" | "right") => void;
  addImage: (dataUrl: string) => void;
  copy: () => void;
  paste: () => void;
  duplicate: () => void;
  undo: () => void;
  redo: () => void;
  layerUp: () => void;
  layerDown: () => void;
  toggleLock: () => void;
  toggleVisibility: () => void;
  setInsertTextMode: (enabled: boolean) => void;
  setImageCropMode: (enabled: boolean) => void;
  deleteActive: () => void;
  getPageImage: () => Promise<string>;
};

export type FabricCanvasProps = {
  page?: Page;
  onPageChange: (pageId: string, json: FabricJSON) => void;
  onReady?: (ready: boolean) => void;
  onTextSelectionChange?: (state: {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    align: "left" | "center" | "right";
    locked: boolean;
    dimmed: boolean;
    opacity: number;
    hasSelection: boolean;
    canEditTextStyle: boolean;
  }) => void;
  headerText?: string;
  headerProjectName?: string;
  headerCustomerName?: string;
  footerLogoUrl?: string;
  pageNumber?: number;
  totalPages?: number;
  designerEmail?: string;
  designerMobile?: string;
};

export type PageDecorOptions = {
  headerText?: string;
  headerProjectName?: string;
  headerCustomerName?: string;
  footerLogoUrl?: string;
  stampUrl?: string;
  isActive?: () => boolean;
  pageNumber?: number;
  totalPages?: number;
  designerEmail?: string;
  designerMobile?: string;
  addContactIfMissing?: boolean;
};

export type CreateCanvasOptions = {
  host: HTMLCanvasElement;
  page?: Page;
  onPageChange: (pageId: string, json: FabricJSON) => void;
  onReady?: (ready: boolean) => void;
  onTextSelectionChange?: (state: {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    align: "left" | "center" | "right";
    locked: boolean;
    dimmed: boolean;
    opacity: number;
    hasSelection: boolean;
    canEditTextStyle: boolean;
  }) => void;
  headerText?: string;
  headerProjectName?: string;
  headerCustomerName?: string;
  footerLogoUrl?: string;
  pageNumber?: number;
  totalPages?: number;
  designerEmail?: string;
  designerMobile?: string;
};

export type AnyCanvas = fabric.Canvas | fabric.StaticCanvas;

export type RenderImageOptions = {
  format?: "png" | "jpeg";
  multiplier?: number;
  quality?: number;
} & PageDecorOptions;

export type ExportOptions = Omit<RenderImageOptions, "format" | "multiplier" | "quality"> & {
  tableData?: TableData;
};

export type TabId = "scene" | "editor" | "download";

export type AppTab = {
  id: TabId;
  label: string;
};

export type TableRow = {
  part: string;
  description: string;
  unitPrice?: string;
  qty?: string | number;
  total?: string;
  isBold?: boolean;
};

export type TableData = {
  rows: TableRow[];
  grandTotal?: string;
};

export type ProposalMeta = {
  projectId?: string;
  projectName?: string;
  customerName?: string;
  designerEmail?: string;
  date?: string;
  mobileNo?: string;
  userType?: string;
};

export type ProposalDocumentSnapshot = {
  schemaVersion: 1;
  activePageId: string | null;
  meta: ProposalMeta;
  tableData: TableData;
  pages: Page[];
};
