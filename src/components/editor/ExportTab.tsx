import { observer } from "mobx-react-lite";
import toast from "react-hot-toast";
import { useStore } from "../../state/Root";
import { downloadSnapshotJson, exportStoreAsPdf } from "../../utils/downloadTab/documentAdapter";

export const ExportTab = observer(function ExportTab() {
  const store = useStore();

  // Export PDF
  const exportPDF = async () => {
    try {
      const snapshot = store.toDocumentSnapshot();
      downloadSnapshotJson(snapshot);
      const pdfBlob = await exportStoreAsPdf(store);

      const params = new URLSearchParams(window.location.search);
      const projectId = params.get("projectId");
      const closetId = params.get("closetId");
      
      if (projectId && closetId && pdfBlob) {
          const formData = new FormData();
          formData.append("jsonPayload", JSON.stringify(snapshot));
          formData.append("pdf", pdfBlob, "export.pdf");
          
          const res = await fetch(`http://localhost:4000/api/project/${projectId}/closet/${closetId}/export`, {
             method: "POST",
             body: formData
          });
          if (res.ok) toast.success("PDF synced to server successfully!");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to export PDF.");
    }
  };

  // Save current working snapshot into session storage.
  const saveSnapshot = () => {
    const saved = store.saveSnapshot();
    if (saved) toast.success("Changes saved.");
    else toast.error("Failed to save changes.");
  };

  return (

    // Project Data Showing
    <section className="scene-layout">
      <div className="panel">
        <h3 className="panel-title">Download & Export</h3>
        <p className="panel-note">Finalize your proposal by exporting it to the desired format.</p>
        <div className="controls-row" style={{ marginTop: 24 }}>
          <button className="btn primary" style={{ padding: '12px 24px' }} onClick={exportPDF}>
            <span style={{ fontSize: '1.1rem' }}>Download PDF</span>
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
          {Object.entries({
            projectId: store.projectId,
            projectName: store.projectName,
            customerName: store.customerName,
            designerEmail: store.designerEmail,
            date: store.date,
            mobileNo: store.mobileNo
          }).map(([key, value]) => (
            <div key={key} style={{ display: 'flex', marginBottom: '8px' }}>
              <span style={{ color: 'var(--muted)', width: '140px' }}>{key}:</span>
              <span style={{ fontWeight: 600 }}>{String(value ?? "")}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
});
