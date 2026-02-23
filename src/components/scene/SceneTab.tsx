
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import type { WebGLRenderer } from "three";
import { addCapture } from "../../state/builderStore";

function CaptureBridge({ glRef }: { glRef: MutableRefObject<WebGLRenderer | null> }) {
  const { gl } = useThree();
  useEffect(() => {
    glRef.current = gl;
  }, [gl, glRef]);
  return null;
}

export function SceneTab() {
  const glRef = useRef<WebGLRenderer | null>(null);

  const handleCapture = () => {
    const gl = glRef.current;
    if (!gl) return;
    const image = gl.domElement.toDataURL("image/png", 1);
    addCapture(image);
  };

  return (
    <section className="scene-layout" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <Canvas
        gl={{ preserveDrawingBuffer: true }}
        camera={{ position: [3, 2.4, 3], fov: 50 }}
        style={{ width: '100%', height: '100%' }}
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[4, 6, 4]} intensity={1.2} />
        <mesh>
          <boxGeometry args={[1.4, 1.4, 1.4]} />
          <meshStandardMaterial color="#f3722c" metalness={0.2} roughness={0.4} />
        </mesh>
        <OrbitControls
          makeDefault
          enableDamping
          maxPolarAngle={Math.PI / 2}
          minDistance={3}
          maxDistance={15}
        />
        <CaptureBridge glRef={glRef} />
      </Canvas>

      <div className="floating-capture-btn-container" style={{ pointerEvents: 'none' }}>
        <button className="floating-capture-btn" style={{ pointerEvents: 'auto' }} onClick={handleCapture}>
          <i className="fa-solid fa-camera"></i> Capture Current
        </button>
      </div>
    </section>
  );
}
