import { observer } from "mobx-react-lite";
import { useStore } from "../../state/Root";
import { downloadSnapshotJson, exportSnapshotAsPdf } from "../../utils/documentAdapter";

export const ExportTab = observer(function ExportTab() {
  const store = useStore();

  // Export PDF
  const exportPDF = async () => {
    const snapshot = store.toDocumentSnapshot();
    downloadSnapshotJson(snapshot);
    await exportSnapshotAsPdf(snapshot);
  };

  return (

    // Project Data Showing
    <section className="scene-layout">
      <div className="panel">
        <h3 className="panel-title">Download & Export</h3>
        <p className="panel-note">Finalize your proposal by exporting it to the desired format.</p>
        <div className="controls-row" style={{ marginTop: 24 }}>
          <button className="btn primary" style={{ padding: '12px 24px' }} onClick={exportPDF}>
            <span style={{ fontSize: '1.1rem' }}>Download Professional PDF</span>
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
