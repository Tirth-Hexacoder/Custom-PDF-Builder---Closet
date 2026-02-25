// Creates Header & Footer In Canvas (Page)

import { fabric } from "fabric";
import type { AnyCanvas, PageDecorOptions } from "../types";

export const HEADER_ID = "fixed-header";
export const FOOTER_ID = "fixed-footer";
export const STAMP_ID = "fixed-stamp";
export const DATE_ID = "fixed-date";
export const PAGE_NUMBER_ID = "fixed-page-number";
export const CONTACT_INFO_ID = "designer-contact-info";

export const DEFAULT_FOOTER_LOGO_URL =
  "https://modularstudio.modularclosets-apps.com/design/assets/logo/logo2.svg";
export const DEFAULT_STAMP_URL = "/stamp.jpg";

const LOCKED_DECORATION_IDS = new Set([HEADER_ID, FOOTER_ID, STAMP_ID, DATE_ID, PAGE_NUMBER_ID]);
const ALL_DECORATION_IDS = new Set([HEADER_ID, FOOTER_ID, STAMP_ID, DATE_ID, PAGE_NUMBER_ID, CONTACT_INFO_ID]);

function canUseCanvas(canvas: AnyCanvas, isActive?: () => boolean) {
  if (isActive && !isActive()) return false;
  const value = canvas as AnyCanvas & {
    lowerCanvasEl?: HTMLCanvasElement | null;
    contextContainer?: CanvasRenderingContext2D | null;
    disposed?: boolean;
  };
  if (value.disposed) return false;
  if (!value.lowerCanvasEl) return false;
  if (!value.contextContainer) return false;
  return true;
}

export function isLockedDecorationId(id?: string) {
  if (!id) return false;
  return LOCKED_DECORATION_IDS.has(id);
}

export function isDecorationId(id?: string) {
  if (!id) return false;
  return ALL_DECORATION_IDS.has(id);
}

export function formatTodayDate() {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric"
  }).format(new Date());
}

export function buildDesignerContactText(designerEmail?: string, designerMobile?: string) {
  const email = designerEmail || "achin@hexacoder.com";
  const mobile = designerMobile || "844-969-92479";
  return `Designer Contact Info - ${email}\n${mobile}`;
}

function findById(canvas: AnyCanvas, id: string) {
  return canvas.getObjects().find((obj) => obj.data?.id === id);
}

function removeById(canvas: AnyCanvas, id: string) {
  const obj = findById(canvas, id);
  if (obj) canvas.remove(obj);
}

function lockObject(obj: fabric.Object) {
  obj.set({
    selectable: false,
    evented: false,
    hasControls: false,
    lockMovementX: true,
    lockMovementY: true,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
    hoverCursor: "default"
  });
}

function moveOnlyObject(obj: fabric.Object) {
  obj.set({
    selectable: true,
    evented: true,
    hasControls: false,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
    hoverCursor: "move"
  });
}

function createHeaderGroup(
  canvas: AnyCanvas,
  headerText: string,
  headerProjectName: string,
  headerCustomerName: string
) {
  const separator = " - ";
  const parts = [
    { text: headerProjectName || "", fill: "#ea580c", fontWeight: "700" },
    { text: separator, fill: "#64748b", fontWeight: "600" },
    { text: headerText || "Modular Closets Renderings", fill: "#334155", fontWeight: "600" },
    { text: separator, fill: "#64748b", fontWeight: "600" },
    { text: headerCustomerName || "", fill: "#64748b", fontWeight: "600" }
  ].filter((item) => item.text !== "");

  if (parts.length === 0) return null;

  let cursorX = 0;
  const textObjects = parts.map((part) => {
    const textObj = new fabric.Text(part.text, {
      left: cursorX,
      top: 0,
      originX: "left",
      originY: "top",
      fontFamily: "Inter",
      fontSize: 16,
      fill: part.fill,
      fontWeight: part.fontWeight,
      selectable: false,
      evented: false,
      hasControls: false
    });
    cursorX += textObj.getScaledWidth();
    return textObj;
  });

  const group = new fabric.Group(textObjects, {
    left: 0,
    top: 18,
    selectable: false,
    evented: false,
    hasControls: false,
    lockMovementX: true,
    lockMovementY: true,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
    hoverCursor: "default"
  });

  const groupWidth = group.getScaledWidth();
  group.set({ left: (canvas.getWidth() - groupWidth) / 2 });
  group.setCoords();
  group.set({ data: { id: HEADER_ID } });
  return group;
}

function addOrUpdateContact(canvas: AnyCanvas, designerEmail?: string, designerMobile?: string, addIfMissing = true) {
  const text = buildDesignerContactText(designerEmail, designerMobile);
  const existing = findById(canvas, CONTACT_INFO_ID);
  if (existing) {
    if ("text" in existing) {
      (existing as fabric.Textbox).set({ text });
    }
    moveOnlyObject(existing);
    return;
  }

  if (!addIfMissing) return;

  const contact = new fabric.Textbox(text, {
    left: (canvas.getWidth() - 360) / 2,
    top: 70,
    width: 400,
    fontFamily: "Inter",
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 1.25,
    fill: "#000000",
    textAlign: "center"
  });
  (contact as fabric.Textbox & { editable?: boolean }).editable = false;
  contact.set({ data: { id: CONTACT_INFO_ID } });
  moveOnlyObject(contact);
  canvas.add(contact);
}

function addDate(canvas: AnyCanvas) {
  const dateText = new fabric.Text(formatTodayDate(), {
    left: canvas.getWidth() - 36,
    top: 20,
    originX: "right",
    originY: "top",
    fontFamily: "Inter",
    fontSize: 12,
    fill: "#64748b",
    textAlign: "right"
  });
  dateText.set({ data: { id: DATE_ID } });
  lockObject(dateText);
  canvas.add(dateText);
}

function addPageNumber(canvas: AnyCanvas, pageNumber?: number, totalPages?: number) {
  if (!pageNumber || !totalPages) return;
  const pageText = new fabric.Text(`Page ${pageNumber} of ${totalPages}`, {
    left: 34,
    top: canvas.getHeight() - 28,
    originX: "left",
    originY: "bottom",
    fontFamily: "Inter",
    fontSize: 12,
    fill: "#000000",
    textAlign: "left"
  });
  pageText.set({ data: { id: PAGE_NUMBER_ID } });
  lockObject(pageText);
  canvas.add(pageText);
}

function addFooter(canvas: AnyCanvas, footerLogoUrl: string, isActive?: () => boolean) {
  return new Promise<void>((resolve) => {
    if (!canUseCanvas(canvas, isActive)) {
      resolve();
      return;
    }
    fabric.Image.fromURL(
      footerLogoUrl,
      (img) => {
        if (!canUseCanvas(canvas, isActive)) {
          resolve();
          return;
        }
        if (img) {
          img.scaleToWidth(180);
          img.set({
            left: (canvas.getWidth() - img.getScaledWidth()) / 2,
            top: canvas.getHeight() - img.getScaledHeight() - 28
          });
          img.set({ data: { id: FOOTER_ID } });
          lockObject(img);
          canvas.add(img);
        }
        resolve();
      },
      { crossOrigin: "anonymous" }
    );
  });
}

function addStamp(canvas: AnyCanvas, stampUrl: string, isActive?: () => boolean) {
  return new Promise<void>((resolve) => {
    if (!canUseCanvas(canvas, isActive)) {
      resolve();
      return;
    }
    fabric.Image.fromURL(
      stampUrl,
      (img) => {
        if (!canUseCanvas(canvas, isActive)) {
          resolve();
          return;
        }
        if (img) {
          img.scaleToWidth(78);
          img.set({
            left: canvas.getWidth() - img.getScaledWidth() - 18,
            top: canvas.getHeight() - img.getScaledHeight() - 8
          });
          img.set({ data: { id: STAMP_ID } });
          lockObject(img);
          canvas.add(img);
        }
        resolve();
      },
      { crossOrigin: "anonymous" }
    );
  });
}

export async function applyPageDecorations(canvas: AnyCanvas, options: PageDecorOptions = {}) {
  const isActive = options.isActive;
  if (!canUseCanvas(canvas, isActive)) return;
  const headerText = options.headerText || "Modular Closets Renderings";
  const headerProjectName = options.headerProjectName || "";
  const headerCustomerName = options.headerCustomerName || "";
  const footerLogoUrl = options.footerLogoUrl || DEFAULT_FOOTER_LOGO_URL;
  const stampUrl = options.stampUrl || DEFAULT_STAMP_URL;

  removeById(canvas, HEADER_ID);
  removeById(canvas, DATE_ID);
  removeById(canvas, PAGE_NUMBER_ID);
  removeById(canvas, FOOTER_ID);
  removeById(canvas, STAMP_ID);
  if (!canUseCanvas(canvas, isActive)) return;

  const headerGroup = createHeaderGroup(canvas, headerText, headerProjectName, headerCustomerName);
  if (headerGroup) canvas.add(headerGroup);
  addDate(canvas);
  addPageNumber(canvas, options.pageNumber, options.totalPages);
  addOrUpdateContact(
    canvas,
    options.designerEmail,
    options.designerMobile,
    options.addContactIfMissing !== false
  );
  await Promise.all([addFooter(canvas, footerLogoUrl, isActive), addStamp(canvas, stampUrl, isActive)]);
}
