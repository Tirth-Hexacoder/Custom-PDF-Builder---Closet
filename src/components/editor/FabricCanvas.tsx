import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { FabricCanvasHandle, FabricCanvasProps } from "../../types";
import { createPageCanvas } from "../../utils/pageUtils";

export const FabricCanvas = forwardRef<FabricCanvasHandle, FabricCanvasProps>(function FabricCanvas(
  {
    page,
    onPageChange,
    onReady,
    headerText,
    headerProjectName,
    headerCustomerName,
    footerLogoUrl,
    pageNumber,
    totalPages,
    designerEmail,
    designerMobile
  },
  ref
) {
  const hostRef = useRef<HTMLCanvasElement | null>(null);
  const apiRef = useRef<ReturnType<typeof createPageCanvas> | null>(null);

  // Creating the Initial Canvas (Page)
  useEffect(() => {
    if (!hostRef.current) return;
    apiRef.current = createPageCanvas({
      host: hostRef.current,
      page,
      onPageChange,
      onReady,
      headerText,
      headerProjectName,
      headerCustomerName,
      footerLogoUrl,
      pageNumber,
      totalPages,
      designerEmail,
      designerMobile
    });
    return () => {
      apiRef.current?.dispose();
      apiRef.current = null;
    };
  }, []);

  // Changing of the Canvas (Page) Reference/Target
  useEffect(() => {
    apiRef.current?.setCallbacks(onPageChange, onReady);
  }, [onPageChange, onReady]);

  // Add Header and Footer When Data is Changed or New Pages are Added
  useEffect(() => {
    apiRef.current?.setHeaderFooter({
      headerText,
      headerProjectName,
      headerCustomerName,
      footerLogoUrl,
      pageNumber,
      totalPages,
      designerEmail,
      designerMobile
    });
  }, [
    headerText,
    headerProjectName,
    headerCustomerName,
    footerLogoUrl,
    pageNumber,
    totalPages,
    designerEmail,
    designerMobile
  ]);

  // Load the Selected Page (Ref)
  useEffect(() => {
    if (!page) return;
    apiRef.current?.loadPage(page);
  }, [page?.id]);

  useImperativeHandle(ref, () => apiRef.current?.handle ?? ({} as FabricCanvasHandle));

  return <canvas ref={hostRef} />;
});
