import React from 'react';

// ---------- icons (sim only) ----------
const SP = {
  chat: 'M4 5h16v11H10l-5 4v-4H4z M8 9.5h8 M8 12.5h5', send: 'M4 12L20 4l-5 16-3-6.5z M12 13.5L20 4', stop: 'M7 7h10v10H7z',
  at: 'M16 12a4 4 0 1 1-1.2-2.8 M16 8v5a2.5 2.5 0 0 0 5 0v-1a9 9 0 1 0-3.6 7.2', flag: 'M5 21V4 M5 4h11l-2 4 2 4H5', up: 'M12 19V5 M6 11l6-6 6 6', down: 'M12 5v14 M6 13l6 6 6-6',
};
export function SimIcon({ name, size = 16, stroke = 2, className = '' }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={name === 'stop' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={SP[name]} /></svg>;
}
