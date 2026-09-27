import React from 'react';

const POD_URL = 'https://firstcry-pod-dar5w3p2faody6udcrwzqm.streamlit.app/';

export default function POD() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', margin: '-16px' }}>
      {/* Header */}
      <div className="page-header" style={{ padding: '12px 20px', marginBottom: 0, flexShrink: 0 }}>
        <div>
          <div className="page-title">📚 Product of the Day</div>
          <div className="page-sub">Staff training portal — daily product explainer &amp; quiz</div>
        </div>
        <a
          href={POD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-sm"
          style={{ fontSize: 12 }}
        >
          ↗ Open in new tab
        </a>
      </div>

      {/* Iframe */}
      <iframe
        src={POD_URL}
        title="Product of the Day Training Portal"
        style={{
          flex: 1,
          border: 'none',
          width: '100%',
          display: 'block',
        }}
        allow="fullscreen"
      />
    </div>
  );
}
