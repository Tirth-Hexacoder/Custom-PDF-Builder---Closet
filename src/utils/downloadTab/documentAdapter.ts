import type { ExportOptions, FabricJSON, Page, ProposalDocumentSnapshot, ReviewImage, ReviewItem, SceneImageInput, SceneImageNote, SceneImageType } from "../../types";
import { exportPagesAsPdf } from "../exportUtils";

type StoreLike = {
  images: ReviewImage[];
  pages: Page[];
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function stableIdFromString(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function stableImageId(url: string) {
  return `img_${stableIdFromString(url)}`;
}

function resolveReviewImageSourceUrl(image: ReviewImage) {
  return image.url || image.imageUrl || image.blobUrl || "";
}

function looksLikeTempUrl(url: string) {
  return url.startsWith("blob:") || url.startsWith("data:");
}

function toSceneImageInput(image: ReviewImage, index: number): SceneImageInput {
  const meta = (image.metadata || {}) as Record<string, unknown>;
  const typeCandidate = image.type || meta.type;
  const type: SceneImageType =
    typeof typeCandidate === "string"
      ? (typeCandidate as SceneImageType)
      : (["2D Default", "2D", "Stretched", "Isometric", "3D", "Wall"][index % 6] as SceneImageType);

  const notesRaw = meta.notes;
  const notes: SceneImageNote[] = Array.isArray(notesRaw) ? (notesRaw as SceneImageNote[]) : [];
  return {
    url: resolveReviewImageSourceUrl(image),
    type,
    notes,
    baseUrl: typeof meta.baseUrl === "string" ? meta.baseUrl : ""
  };
}

function collectImageUrlsFromFabricJson(json: FabricJSON) {
  if (!json || !isRecord(json)) return [] as string[];
  const objects = (json as Record<string, unknown>).objects;
  if (!Array.isArray(objects)) return [] as string[];
  const urls: string[] = [];
  objects.forEach((obj) => {
    if (!isRecord(obj)) return;
    if (obj.type !== "image") return;
    const src = asString(obj.src);
    const data = isRecord(obj.data) ? obj.data : null;
    const fallback = data ? asString(data.defaultImageUrl) : "";
    const url = src || fallback;
    if (url) urls.push(url);
  });
  return urls;
}

function reviewItemsFromFabricJson(json: FabricJSON, imageIdByUrl: Map<string, string>): ReviewItem[] {
  if (!json || !isRecord(json)) return [];
  const objects = (json as Record<string, unknown>).objects;
  if (!Array.isArray(objects)) return [];

  const items: ReviewItem[] = [];
  objects.forEach((obj, index) => {
    if (!isRecord(obj)) return;
    const type = asString(obj.type);
    const data = isRecord(obj.data) ? (obj.data as Record<string, unknown>) : {};
    const itemId = asString(data.reviewItemId) || `item_${index}_${stableIdFromString(JSON.stringify(obj).slice(0, 64))}`;
    const position = { x: asNumber(obj.left, 0), y: asNumber(obj.top, 0) };
    
    // Logic: If we stored a logical 'slot' size (for auto-layouts), prioritize that.
    // Otherwise, use the actual object dimensions (for user-added/transformed items).
    const slotW = asNumber(data.slotWidth, 0);
    const slotH = asNumber(data.slotHeight, 0);
    const size = (slotW > 0 && slotH > 0) 
      ? { width: slotW, height: slotH }
      : { width: asNumber(obj.width, 0), height: asNumber(obj.height, 0) };

    const rotation = asNumber(obj.angle, 0);
    const scale = { x: asNumber(obj.scaleX, 1), y: asNumber(obj.scaleY, 1) };
    const opacity = asNumber(obj.opacity, 1);
    const locked = !!data.userLocked || !!(obj as any).lockMovementX || !!(obj as any).lockMovementY;
    const hidden = (obj as any).visible === false;

    if (type === "image") {
      const src = asString(obj.src) || asString(data.defaultImageUrl);
      const imageId = src ? (imageIdByUrl.get(src) || stableImageId(src)) : "";
      items.push({
        itemId,
        type: "image",
        imageId,
        position,
        size,
        rotation,
        scale,
        opacity,
        locked,
        hidden,
        crop: {
          cropX: asNumber(obj.cropX, 0),
          cropY: asNumber(obj.cropY, 0),
          width: asNumber(obj.width, 0),
          height: asNumber(obj.height, 0),
          sourceWidth: typeof data.cropSourceWidth === "number" ? data.cropSourceWidth : undefined,
          sourceHeight: typeof data.cropSourceHeight === "number" ? data.cropSourceHeight : undefined
        }
      });
      return;
    }

    if (type === "text" || type === "textbox" || type === "i-text") {
      const alignRaw = asString(obj.textAlign);
      const align: "left" | "center" | "right" = alignRaw === "center" || alignRaw === "right" ? alignRaw : "left";
      items.push({
        itemId,
        type: "text",
        text: asString(obj.text),
        position,
        size,
        rotation,
        scale,
        opacity,
        locked,
        hidden,
        style: {
          fontFamily: asString(obj.fontFamily) || undefined,
          fontSize: typeof obj.fontSize === "number" ? obj.fontSize : undefined,
          fontWeight: typeof obj.fontWeight === "number" || typeof obj.fontWeight === "string" ? obj.fontWeight : undefined,
          fontStyle: asString(obj.fontStyle) || undefined,
          underline: !!obj.underline,
          fill: asString(obj.fill) || undefined,
          align
        }
      });
      return;
    }

    if (type === "rect") {
      items.push({
        itemId,
        type: "shape",
        shape: "rect",
        position,
        size,
        rotation,
        scale,
        opacity,
        locked,
        hidden,
        style: {
          fill: asString(obj.fill) || undefined,
          stroke: asString(obj.stroke) || undefined,
          strokeWidth: typeof obj.strokeWidth === "number" ? obj.strokeWidth : undefined,
          rx: typeof obj.rx === "number" ? obj.rx : undefined,
          ry: typeof obj.ry === "number" ? obj.ry : undefined
        }
      });
    }
  });

  return items;
}

function fabricJsonFromReviewItems(items: ReviewItem[], imagesById: Map<string, ReviewImage>): FabricJSON {
  const objects: Record<string, unknown>[] = [];
  items.forEach((item) => {
    if (item.type === "image") {
      const image = imagesById.get(item.imageId);
      const src = (image?.url || image?.blobUrl || image?.imageUrl || "");
      // We do NOT force width/height on the fabric image object.
      // Instead we pass the slot dimensions as data so the canvas
      // can scale the image proportionally once it knows the real source size.
      objects.push({
        type: "image",
        left: item.position.x,
        top: item.position.y,
        scaleX: item.scale?.x ?? 1,
        scaleY: item.scale?.y ?? 1,
        angle: item.rotation ?? 0,
        opacity: item.opacity ?? 1,
        visible: item.hidden ? false : true,
        cropX: item.crop?.cropX ?? 0,
        cropY: item.crop?.cropY ?? 0,
        src,
        crossOrigin: "anonymous",
        data: {
          reviewItemId: item.itemId,
          userLocked: !!item.locked,
          cropSourceWidth: item.crop?.sourceWidth,
          cropSourceHeight: item.crop?.sourceHeight,
          // Store slot size so the canvas can auto-scale to fit after load
          slotWidth: item.size.width,
          slotHeight: item.size.height
        },
        selectable: true,
        evented: true,
        hasControls: !item.locked,
        lockMovementX: !!item.locked,
        lockMovementY: !!item.locked,
        lockScalingX: !!item.locked,
        lockScalingY: !!item.locked,
        lockRotation: !!item.locked
      });
      return;
    }

    if (item.type === "text" || item.type === "annotation") {
      objects.push({
        type: "i-text",
        text: item.text,
        left: item.position.x,
        top: item.position.y,
        width: item.size.width,
        height: item.size.height,
        scaleX: item.scale?.x ?? 1,
        scaleY: item.scale?.y ?? 1,
        angle: item.rotation ?? 0,
        opacity: item.opacity ?? 1,
        visible: item.hidden ? false : true,
        fontFamily: item.style?.fontFamily ?? "Georgia",
        fontSize: item.style?.fontSize ?? 24,
        fontWeight: item.style?.fontWeight ?? "normal",
        fontStyle: item.style?.fontStyle ?? "normal",
        underline: !!item.style?.underline,
        fill: item.style?.fill ?? "#1f2937",
        textAlign: item.style?.align ?? "left",
        data: {
          reviewItemId: item.itemId,
          userLocked: !!item.locked
        },
        selectable: true,
        evented: true,
        hasControls: !item.locked,
        lockMovementX: !!item.locked,
        lockMovementY: !!item.locked,
        lockScalingX: !!item.locked,
        lockScalingY: !!item.locked,
        lockRotation: !!item.locked
      });
      return;
    }

    if (item.type === "shape" && item.shape === "rect") {
      objects.push({
        type: "rect",
        left: item.position.x,
        top: item.position.y,
        width: item.size.width,
        height: item.size.height,
        scaleX: item.scale?.x ?? 1,
        scaleY: item.scale?.y ?? 1,
        angle: item.rotation ?? 0,
        opacity: item.opacity ?? 1,
        visible: item.hidden ? false : true,
        fill: item.style?.fill ?? "rgba(0,0,0,0)",
        stroke: item.style?.stroke ?? "#111827",
        strokeWidth: item.style?.strokeWidth ?? 1,
        rx: item.style?.rx ?? 0,
        ry: item.style?.ry ?? 0,
        data: {
          reviewItemId: item.itemId,
          userLocked: !!item.locked
        },
        selectable: !item.locked,
        evented: !item.locked,
        hasControls: !item.locked,
        lockMovementX: !!item.locked,
        lockMovementY: !!item.locked,
        lockScalingX: !!item.locked,
        lockScalingY: !!item.locked,
        lockRotation: !!item.locked
      });
    }
  });

  return {
    version: "5.3.0",
    objects
  } as unknown as FabricJSON;
}

export function validateProposalDocumentSnapshot(value: unknown): value is ProposalDocumentSnapshot {
  if (!isRecord(value)) return false;
  const images = value.images;
  const pages = value.pages;

  if (!Array.isArray(images)) return false;
  if (!Array.isArray(pages)) return false;

  return pages.every((page) => {
    if (!isRecord(page)) return false;
    if (typeof page.pageId !== "string" || page.pageId.length === 0) return false;
    if (!Array.isArray(page.items)) return false;
    return true;
  });
}

export function parseSnapshotJsonText(text: string) {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!validateProposalDocumentSnapshot(parsed)) {
      return { snapshot: null as ProposalDocumentSnapshot | null, error: "Invalid snapshot format." };
    }
    return { snapshot: parsed as ProposalDocumentSnapshot, error: "" };
  } catch {
    return { snapshot: null as ProposalDocumentSnapshot | null, error: "Invalid JSON file." };
  }
}

export function buildDocumentSnapshot(source: StoreLike): ProposalDocumentSnapshot {
  const imageById = new Map<string, ReviewImage>();
  const imageIdByUrl = new Map<string, string>();

  const addImage = (img: ReviewImage) => {
    const url = resolveReviewImageSourceUrl(img);
    const id = img.id || (url ? stableImageId(url) : "");
    if (!id) return;
    if (!imageById.has(id)) {
      const normalized: ReviewImage = {
        id,
        url: looksLikeTempUrl(url) ? undefined : url,
        imageUrl: looksLikeTempUrl(url) ? "" : url,
        blobUrl: looksLikeTempUrl(url) ? url : img.blobUrl,
        type: img.type,
        metadata: img.metadata ? clone(img.metadata) : undefined
      };
      imageById.set(id, normalized);
    }
    if (url && !imageIdByUrl.has(url)) imageIdByUrl.set(url, id);
  };

  (source.images || []).forEach((img) => addImage(img));
  source.pages.forEach((page) => {
    const defaultImages: SceneImageInput[] = Array.isArray(page.defaultImages) ? page.defaultImages : [];
    defaultImages.forEach((entry, index) => {
      addImage({
        id: stableImageId(entry.url),
        url: entry.url,
        type: entry.type,
        metadata: {
          type: entry.type,
          notes: entry.notes || [],
          baseUrl: entry.baseUrl || ""
        }
      });
      imageIdByUrl.set(entry.url, stableImageId(entry.url));
    });
    collectImageUrlsFromFabricJson(page.fabricJSON).forEach((url) => {
      addImage({ id: stableImageId(url), imageUrl: looksLikeTempUrl(url) ? "" : url, blobUrl: looksLikeTempUrl(url) ? url : undefined });
      imageIdByUrl.set(url, stableImageId(url));
    });
  });

  const images = Array.from(imageById.values());

  return {
    images: clone(images),
    pages: source.pages.map((page, index) => {
      return {
        pageId: page.id,
        items: reviewItemsFromFabricJson(page.fabricJSON, imageIdByUrl)
      } satisfies ProposalDocumentSnapshot["pages"][number];
    })
  };
}

export async function exportStoreAsPdf(source: StoreLike) {
  const options: ExportOptions = { headerText: "Modular Closets Renderings" };
  return await exportPagesAsPdf(source.pages, options);
}

export function downloadSnapshotJson(snapshot: ProposalDocumentSnapshot) {
  const content = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `review-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function rebuildPagesFromSnapshot(snapshot: ProposalDocumentSnapshot): Page[] {
  const imagesById = new Map<string, ReviewImage>((snapshot.images || []).filter(img => !!img.id).map((img) => [img.id as string, img]));
  return (snapshot.pages || []).map((pageSnap, index) => {
    const pageId = pageSnap.pageId || crypto.randomUUID();
    const fabricJSON = Array.isArray(pageSnap.items) && pageSnap.items.length > 0
      ? fabricJsonFromReviewItems(pageSnap.items, imagesById)
      : null;

    return {
      id: pageId,
      name: `Page ${index + 1}`,
      fabricJSON,
      defaultImages: undefined,
      defaultImageUrl: undefined,
      defaultImage: undefined,
      defaultLayout: undefined
    } satisfies Page;
  });
}
