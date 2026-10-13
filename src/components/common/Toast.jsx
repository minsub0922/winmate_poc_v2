import { useEffect, useState } from 'react';

// 화면 아래 가운데에 잠깐 뜨는 알림. 어디서든 toast('…') 로 띄우고, 앱에 <Toasts /> 하나를 둔다.
const subs = new Set();

/** kind: '' | 'warn' */
export function toast(msg, kind = '') {
  for (const f of subs) f({ id: Math.random(), msg, kind });
}

export function Toasts() {
  const [list, setList] = useState([]);
  useEffect(() => {
    const f = (t) => { setList((l) => [...l, t]); setTimeout(() => setList((l) => l.filter((x) => x.id !== t.id)), 2600); };
    subs.add(f); return () => subs.delete(f);
  }, []);
  return <div className="toasts" role="status" aria-live="polite">{list.map((t) => <div key={t.id} className={'toast ' + t.kind}>{t.msg}</div>)}</div>;
}
