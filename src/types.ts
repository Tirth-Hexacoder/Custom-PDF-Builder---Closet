import type { fabric } from 'fabric';

// Shared app-wide TypeScript types for documents, images, and editor plumbing.
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

export type ReviewImageMetadata = {
  cameraPosition?: unknown;
  showDimensions?: boolean;
  showLineDiagram?: boolean;
  showPriceTable?: boolean;
  tableInfo?: unknown;
  [key: string]: unknown;
};

export type ReviewImage = {
  id?: string;
  url?: string;
  type?: string;
  cameraInfo?: any;
  info?: {
    openAllDoors: boolean;
    propsType: string;
    showObjects: boolean;
    tempVisibleIndex: boolean[];
    wall: number;
  };
  imageUrl?: string;
  blobUrl?: string;
  metadata?: ReviewImageMetadata;
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
  images: ReviewImage[];
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
  addShape: (shape: "rect" | "circle" | "triangle" | "line") => void;
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
  getPageHierarchy: () => {
    items: Array<{
      key: string;
      label: string;
      objectType: string;
      visible: boolean;
      locked: boolean;
      canDelete: boolean;
    }>;
    selectedKeys: string[];
  };
  selectHierarchyItem: (key: string) => void;
  toggleHierarchyItemVisibility: (key: string) => void;
  deleteHierarchyItem: (key: string) => void;
};

export type FabricCanvasProps = {
  page?: Page;
  onPageChange: (pageId: string, json: FabricJSON) => void;
  onReady?: (ready: boolean) => void;
  onCanvasChange?: () => void;
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
  onCanvasChange?: () => void;
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

export type TabId = "editor" | "download";

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
  images: ReviewImage[];
  pages: Array<{
    pageId: string;
    items: ReviewItem[];
  }>;
};

export type ReviewItemBase = {
  itemId: string;
  type: "image" | "text" | "shape" | "annotation";
  position: { x: number; y: number };
  size: { width: number; height: number };
  rotation?: number;
  scale?: { x: number; y: number };
  opacity?: number;
  locked?: boolean;
  hidden?: boolean;
};

export type ReviewImageItem = ReviewItemBase & {
  type: "image";
  imageId: string;
  source?: string;
  isInitialized?: boolean;
  crop?: {
    cropX: number;
    cropY: number;
    width: number;
    height: number;
    sourceWidth?: number;
    sourceHeight?: number;
  };
};

export type ReviewTextItem = ReviewItemBase & {
  type: "text" | "annotation";
  text: string;
  style?: {
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: string | number;
    fontStyle?: string;
    underline?: boolean;
    fill?: string;
    align?: "left" | "center" | "right";
  };
};

export type ReviewShapeItem = ReviewItemBase & {
  type: "shape";
  shape: "rect" | "circle" | "triangle" | "line";
  radius?: number;
  points?: { x1: number; y1: number; x2: number; y2: number };
  style?: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    rx?: number;
    ry?: number;
  };
};

export type ReviewItem = ReviewImageItem | ReviewTextItem | ReviewShapeItem;
