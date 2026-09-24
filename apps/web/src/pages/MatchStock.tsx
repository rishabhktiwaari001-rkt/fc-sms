import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch';
import { Load } from '@fc-sms/types';

export default function MatchStock() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { data: loads, loading } = useFetch<Load[]>('/loads');

  // Only open (not closed) loads
  const open = (loads ?? []).filter(l => !l.closedAt && !l.closeDate);
  const filtered = open.filter(l =>
    !search ||
    (l.loadId ?? l.id).toLowerCase().includes(search.toLowerCase()) ||
    l.docket.toLowerCase().includes(search.toLowerCase()) ||
    l.courier.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="loading">Loading loads…</div>;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Match Stock</div>
          <div className="page-sub">{filtered.length} open load(s) pending verification</div>
        </div>
        <input
          className="inp"
          style={{ width: 260 }}
          placeholder="Search load ID, docket, courier…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Load ID</th>
                <th>WH</th>
                <th>Courier</th>
                <th>Docket</th>
                <th>Boxes</th>
                <th>MRP / CTC</th>
                <th>Imported</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text2)' }}>
                    {open.length === 0
                      ? 'No open loads — import a CSV to get started'
                      : 'No loads match your search'}
                  </td>
                </tr>
              )}
              {filtered.map(load => (
                <tr key={load.id}>
                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, padding: '2px 6px' }}
                      onClick={() => navigate(`/stock/${load.id}`)}
                    >
                      {load.loadId || load.id}
                    </button>
                  </td>
                  <td style={{ fontSize: 12 }}>{load.warehouseId}</td>
                  <td style={{ fontSize: 12 }}>{load.courier}</td>
                  <td className="mono" style={{ fontSize: 11 }}>{load.docket}</td>
                  <td style={{ textAlign: 'center' }}>{load.boxes}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>₹{Number(load.totalMrp).toLocaleString('en-IN')}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>₹{Number(load.totalCtc).toLocaleString('en-IN')}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: 12 }}>{new Date(load.importedAt ?? load.importDate).toLocaleDateString('en-IN')}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>{load.importedBy}</div>
                  </td>
                  <td>
                    <button
                      className="btn btn-brand btn-sm"
                      onClick={() => navigate(`/stock/${load.id}`)}
                    >
                      Scan / Verify
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
