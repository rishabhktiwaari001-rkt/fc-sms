import React, { useRef, useState } from 'react';
import { api } from '../lib/api';
import { useNavigate } from 'react-router-dom';

export default function Import() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ loadId: string; products: number } | null>(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function uploadFile(file: File) {
    if (!file.name.endsWith('.csv')) {
      setError('Please upload a CSV file.');
      return;
    }
    setImporting(true);
    setError('');
    setResult(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.post('/loads/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(res.data.data);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Import Stock</div>
          <div className="page-sub">Upload Inward Details CSV to create a load</div>
        </div>
      </div>

      <div className="card">
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? 'var(--brand)' : 'var(--border)'}`,
            borderRadius: 10,
            padding: '48px 24px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragging ? 'rgba(224,50,120,0.04)' : 'var(--bg1)',
            transition: 'all 0.15s',
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>📥</div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            {importing ? 'Importing…' : 'Drop CSV here or click to browse'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            Accepts Inward Details export from FC portal
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            hidden
            onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0])}
          />
        </div>

        {error && <div className="error-box" style={{ marginTop: 16 }}>{error}</div>}

        {result && (
          <div style={{
            marginTop: 16,
            padding: 16,
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.2)',
            borderRadius: 8,
          }}>
            <div style={{ fontWeight: 700, color: 'var(--green)', marginBottom: 6 }}>
              ✓ Load imported successfully
            </div>
            <div style={{ fontSize: 13 }}>
              <b>Load ID:</b> <span className="mono">{result.loadId}</span>
              &emsp;<b>Products:</b> {result.products}
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button className="btn btn-brand btn-sm" onClick={() => navigate('/stock')}>
                View in Stock
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setResult(null); setError(''); }}>
                Import Another
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">CSV Format Guide</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.8 }}>
          <p>The CSV must have these columns (order doesn't matter):</p>
          <div className="tbl-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Column</th>
                  <th>Required</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['load', 'Yes', 'Load ID e.g. LD240001'],
                  ['warehouseID', 'Yes', 'WH code'],
                  ['shippingID', 'Yes', 'Docket / AWB number'],
                  ['boxID', 'No', 'Box identifier'],
                  ['fcId', 'Yes', 'Product FC SKU'],
                  ['productName', 'Yes', 'Product display name'],
                  ['mrp', 'Yes', 'MRP (decimal)'],
                  ['ctc', 'Yes', 'Cost to company'],
                  ['quantity', 'Yes', 'Qty in this row'],
                  ['brand', 'No', 'Brand name'],
                ].map(([col, req, notes]) => (
                  <tr key={col}>
                    <td className="mono" style={{ fontSize: 12 }}>{col}</td>
                    <td>
                      <span className={`chip chip-${req === 'Yes' ? 'red' : 'gray'}`}>{req}</span>
                    </td>
                    <td style={{ color: 'var(--text2)' }}>{notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
