
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { Camera, Group, WebGLRenderer } from "three";
import { useStore } from "../../state/Root";
import toast from "react-hot-toast";
import { captureCanvasWithProjectedObjectCropTimed } from "../../utils/sceneCaptureCrop";

function CaptureBridge({
  glRef,
  cameraRef
}: {
  glRef: MutableRefObject<WebGLRenderer | null>;
  cameraRef: MutableRefObject<Camera | null>;
}) {
  const { gl, camera } = useThree();
  useEffect(() => {
    glRef.current = gl;
    cameraRef.current = camera;
  }, [camera, cameraRef, gl, glRef]);
  return null;
}

function ClosetModel() {
  const { scene } = useGLTF("/closet.glb");
  return <primitive rotation={[-Math.PI,0,0]} object={scene as Group} />;
}

useGLTF.preload("/closet.glb");

export function SceneTab({ isActive = true }: { isActive?: boolean }) {
  const store = useStore();
  const glRef = useRef<WebGLRenderer | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const closetRootRef = useRef<Group | null>(null);
  const timerRef = useRef<number | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [runningMs, setRunningMs] = useState(0);
  const [lastProcessMs, setLastProcessMs] = useState(0);
  const [lastEncodeMs, setLastEncodeMs] = useState(0);
  const [totalProcessMs, setTotalProcessMs] = useState(0);

  const stopTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopTimer();
  }, []);

  const handleCapture = () => {
    const gl = glRef.current;
    if (!gl) return;
    setIsCapturing(true);
    setRunningMs(0);

    const processStart = performance.now();
    stopTimer();
    timerRef.current = window.setInterval(() => {
      setRunningMs(performance.now() - processStart);
    }, 16);

    const result = captureCanvasWithProjectedObjectCropTimed({
      sourceCanvas: gl.domElement,
      camera: cameraRef.current,
      target: closetRootRef.current,
      paddingPx: 2,
      mimeType: "image/png",
      quality: 1
    });
    const processMs = result.elapsedMs;
    stopTimer();
    setIsCapturing(false);
    setRunningMs(processMs);
    setLastProcessMs(result.processingMs);
    setLastEncodeMs(result.encodeMs);
    setTotalProcessMs((prev) => prev + processMs);

    const image = result.image;
    if (!image) return;
    store.addCapture(image);
    toast.success("Scene captured!");
  };

  return (
    <section className="scene-layout" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div
        style={{
          position: "absolute",
          top: 16,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 180,
          background: "rgba(15,23,42,0.82)",
          color: "#fff",
          padding: "8px 14px",
          borderRadius: 999,
          fontSize: 13,
          fontWeight: 700,
          pointerEvents: "none"
        }}
      >
        {isCapturing
          ? `Processing: ${runningMs.toFixed(2)} ms`
          : `Last: ${lastProcessMs.toFixed(2)} + ${lastEncodeMs.toFixed(2)} = ${(lastProcessMs + lastEncodeMs).toFixed(2)} ms`}{" "}
        | Total: {totalProcessMs.toFixed(2)} ms
      </div>
      <Canvas
        gl={{ preserveDrawingBuffer: true }}
        camera={{ position: [3, 2.4, 3], fov: 50 }}
        frameloop={isActive ? "always" : "never"}
        style={{ width: '100%', height: '100%' }}
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[4, 6, 4]} intensity={1.2} />
        <group ref={closetRootRef}>
          <Suspense fallback={null}>
            <ClosetModel />
          </Suspense>
        </group>
        <OrbitControls
          makeDefault
          enableDamping
          maxPolarAngle={Math.PI / 2}
          minDistance={3}
          maxDistance={15}
        />
        <CaptureBridge glRef={glRef} cameraRef={cameraRef} />
      </Canvas>

      <div className="floating-capture-btn-container" style={{ pointerEvents: 'none' }}>
        <button className="floating-capture-btn" style={{ pointerEvents: 'auto' }} onClick={handleCapture}>
          <i className="fa-solid fa-camera"></i> Capture Current
        </button>
      </div>
    </section>
  );
}
