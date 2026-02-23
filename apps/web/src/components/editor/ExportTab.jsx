import { jsPDF } from "jspdf";
import { useSnapshot } from "valtio";
import { fabric } from "fabric";
import { A4_PX } from "@closet/core";
import { builderStore } from "../../state/builderStore";

async function renderPage(page) {
  if (!page.fabricJSON) return null;
  const el = document.createElement("canvas");
  const canvas = new fabric.StaticCanvas(el, { width: A4_PX.width, height: A4_PX.height });
  return new Promise((resolve) => {
    canvas.loadFromJSON(page.fabricJSON, () => {
      canvas.renderAll();
      const dataUrl = canvas.toDataURL({ format: "png", multiplier: 2 });
      canvas.dispose();
      resolve(dataUrl);
    });
  });
}

export function ExportTab() {
  const snap = useSnapshot(builderStore);

  const exportPDF = async () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    let pageCount = 0;
    for (let i = 0; i < snap.pages.length; i += 1) {
      const data = await renderPage(snap.pages[i]);
      if (!data) continue;
      if (pageCount > 0) doc.addPage();
      doc.addImage(data, "PNG", 0, 0, 595, 842, undefined, "FAST");
      pageCount += 1;
    }
    doc.save(`proposal-${Date.now()}.pdf`);
  };

  const exportImages = async () => {
    for (let i = 0; i < snap.pages.length; i += 1) {
      const data = await renderPage(snap.pages[i]);
      if (!data) continue;
      const a = document.createElement("a");
      a.href = data;
      a.download = `${snap.pages[i].name.toLowerCase().replace(/\s+/g, "-")}.png`;
      a.click();
    }
  };

  return (
    <section className="scene-layout">
      <div className="panel">
        <h3 className="panel-title">Download & Export</h3>
        <p className="panel-note">Finalize your proposal by exporting it to the desired format.</p>
        <div className="controls-row" style={{ marginTop: 24 }}>
          <button className="btn primary" style={{ padding: '12px 24px' }} onClick={exportPDF}>
            <span style={{ fontSize: '1.1rem' }}>Download Professional PDF</span>
          </button>
          <button className="btn" style={{ padding: '12px 24px' }} onClick={exportImages}>
            Download as Images
          </button>
        </div>
      </div>

      <div className="panel">
        <h4 className="panel-title">Project Data Preview</h4>
        <p className="panel-note">The following values are used for dynamic placeholders like {"{{project_name}}"}</p>
        <div style={{
          background: 'var(--workspace)',
          padding: '20px',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          fontFamily: 'monospace',
          fontSize: '0.9rem',
          color: 'var(--primary)',
          marginTop: 12
        }}>
          {Object.entries(snap.project).map(([key, value]) => (
            <div key={key} style={{ display: 'flex', marginBottom: '8px' }}>
              <span style={{ color: 'var(--muted)', width: '140px' }}>{key}:</span>
              <span style={{ fontWeight: 600 }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
