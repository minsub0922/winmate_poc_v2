// QA sheet: every product / solution / case-industry thumbnail on one page
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Thumb } from '../src/thumbs.jsx';
import { PRODUCTS, SOLUTIONS, CASES, INDUSTRIES } from '../src/data.js';
const firstCase = (code) => CASES.find((c) => c.ind === code);
const cases = [...INDUSTRIES.map((i) => firstCase(i.code)).filter(Boolean), CASES.find((c) => !c.ind), CASES.find((c) => c.id === 1490)];
const cell = (r, t) => <div key={r} style={{ width: 200, font: '12px sans-serif', color: 'var(--ink)' }}><Thumb r={r} /><div style={{ marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t}</div></div>;
function App() {
  return (
    <div style={{ padding: 16, display: 'flex', flexWrap: 'wrap', gap: 12, background: 'var(--surface)' }}>
      {PRODUCTS.map((p) => cell('product:' + p.id, p.id + ' · ' + p.cat))}
      {SOLUTIONS.map((s) => cell('solution:' + s.id, s.id + ' · ' + s.cat))}
      {cases.map((c) => cell('case:' + c.id, (c.ind || '-') + ' · ' + c.cust + ' · ' + (c.prod || []).join(',')))}
    </div>
  );
}
createRoot(document.getElementById('root')).render(<App />);
