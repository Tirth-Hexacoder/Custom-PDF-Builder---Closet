import type { Camera, Group, WebGLRenderer } from "three";
import { captureCanvasWithProjectedObjectCropTimed } from "./captureCrop/projectedObjectCrop";

export type SceneCaptureResult = {
  image: string;
  processingMs: number;
  encodeMs: number;
  elapsedMs: number;
};

// Capture scene canvas around target object and return timing details for UI stats.
export function captureSceneImage(
  gl: WebGLRenderer | null,
  camera: Camera | null,
  target: Group | null
): SceneCaptureResult {
  if (!gl) {
    return { image: "", processingMs: 0, encodeMs: 0, elapsedMs: 0 };
  }

  return captureCanvasWithProjectedObjectCropTimed({
    sourceCanvas: gl.domElement,
    camera,
    target,
    paddingPx: 2,
    mimeType: "image/jpeg",
    quality: 0.9
  });
}

