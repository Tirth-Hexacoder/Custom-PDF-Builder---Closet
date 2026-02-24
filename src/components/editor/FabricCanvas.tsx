import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { FabricJSON, Page } from "../../state/Store";
import { PageCanvasController, type FabricCanvasHandle } from "../../utils/pageUtils";

export type { FabricCanvasHandle } from "../../utils/pageUtils";

export type FabricCanvasProps = {
  page?: Page;
  onPageChange: (json: FabricJSON) => void;
  onReady?: (ready: boolean) => void;
  headerText?: string;
  headerProjectName?: string;
  headerCustomerName?: string;
  footerLogoUrl?: string;
};

export const FabricCanvas = forwardRef<FabricCanvasHandle, FabricCanvasProps>(function FabricCanvas(
  { page, onPageChange, onReady, headerText, headerProjectName, headerCustomerName, footerLogoUrl },
  ref
) {
  const hostRef = useRef<HTMLCanvasElement | null>(null);
  const controllerRef = useRef<PageCanvasController | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    controllerRef.current = new PageCanvasController({
      host: hostRef.current,
      page,
      onPageChange,
      onReady,
      headerText,
      headerProjectName,
      headerCustomerName,
      footerLogoUrl
    });
    return () => {
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!page) return;
    controllerRef.current?.loadPage(page);
  }, [page?.id]);

  useEffect(() => {
    controllerRef.current?.setCallbacks(onPageChange, onReady);
  }, [onPageChange, onReady]);

  useEffect(() => {
    controllerRef.current?.setHeaderFooter({
      headerText,
      headerProjectName,
      headerCustomerName,
      footerLogoUrl
    });
  }, [headerText, headerProjectName, headerCustomerName, footerLogoUrl]);

  useImperativeHandle(ref, () => controllerRef.current?.getHandle() ?? ({} as FabricCanvasHandle));

  return <canvas ref={hostRef} />;
});
