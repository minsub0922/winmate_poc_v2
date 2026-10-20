import React, { useEffect, useRef, useState } from 'react';
import media from '../../domain/guides/media.json' with { type: 'json' };
function PlaybackIcon({ kind }) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'pause' ? <><path d="M8 5v14M16 5v14" strokeWidth="4" /></> : kind === 'play' ? <path d="m8 4 12 8-12 8z" fill="currentColor" stroke="none" /> : <><path d="M3 10a9 9 0 1 1 1 8M3 4v6h6" /><path d="m10 8 6 4-6 4z" fill="currentColor" stroke="none" /></>}
  </svg>;
}

// Decode the actual GIF off the main thread. A canvas gives pause/resume precise
// frame timing instead of swapping an animated <img> back to its first frame.
export default function GuidePreview({ step, guide }) {
  const clip = media[guide.id]?.[guide.steps.indexOf(step)];
  const canvas = useRef(null), progress = useRef(null), playback = useRef(null);
  const [playing, setPlaying] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const [status, setStatus] = useState('loading'), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!clip) { setStatus('error'); return; }
    let disposed = false, worker, timer, deadline = 0, remaining = 0, index = 0, frames, previous, backup;
    const controller = new AbortController(), context = canvas.current.getContext('2d');
    const patchCanvas = document.createElement('canvas'), patchContext = patchCanvas.getContext('2d');
    const stop = () => { if (timer != null) { clearTimeout(timer); timer = null; remaining = Math.max(1, deadline - performance.now()); } };
    const paint = next => {
      if (!next) { context.clearRect(0, 0, canvas.current.width, canvas.current.height); previous = null; backup = null; }
      if (previous?.disposalType === 2) {
        const d = previous.dims; context.clearRect(d.left, d.top, d.width, d.height);
      } else if (previous?.disposalType === 3 && backup) context.putImageData(backup, 0, 0);
      const frame = frames[next], d = frame.dims;
      backup = frame.disposalType === 3 ? context.getImageData(0, 0, canvas.current.width, canvas.current.height) : null;
      patchCanvas.width = d.width; patchCanvas.height = d.height;
      patchContext.putImageData(new ImageData(frame.patch, d.width, d.height), 0, 0);
      context.drawImage(patchCanvas, d.left, d.top);
      previous = frame; index = next; remaining = frame.delay;
      canvas.current.dataset.frame = String(next);
      if (progress.current) progress.current.style.transform = `scaleX(${(next + 1) / frames.length})`;
    };
    const schedule = () => {
      if (disposed || !frames || !playingRef.current || document.hidden || timer != null) return;
      deadline = performance.now() + remaining;
      timer = setTimeout(() => { timer = null; if (disposed) return; paint((index + 1) % frames.length); schedule(); }, remaining);
    };
    playback.current = {
      update: () => { stop(); schedule(); },
      restart: () => { stop(); if (frames) { paint(0); schedule(); } },
    };
    const visibility = () => { stop(); schedule(); };
    document.addEventListener('visibilitychange', visibility);
    setStatus('loading');
    (async () => {
      try {
        const response = await fetch(clip.src, { signal: controller.signal });
        if (!response.ok) throw new Error('GIF unavailable');
        const bytes = await response.arrayBuffer();
        if (disposed) return;
        worker = new Worker(new URL('./gif-worker.js', import.meta.url), { type: 'module' });
        const fail = () => { if (!disposed) { setStatus('error'); worker?.terminate(); } };
        worker.onerror = event => { console.error('Guide GIF worker failed', event.message); fail(); };
        worker.onmessage = ({ data }) => {
          if (disposed) return;
          if (data.error || !data.frames?.length) { fail(); return; }
          frames = data.frames; canvas.current.width = data.width; canvas.current.height = data.height;
          paint(0); setStatus('ready'); schedule(); worker.terminate();
        };
        worker.postMessage(bytes, [bytes]);
      } catch (error) { if (!disposed && error.name !== 'AbortError') setStatus('error'); }
    })();
    return () => {
      disposed = true; clearTimeout(timer); controller.abort(); worker?.terminate(); playback.current = null;
      frames = null; backup = null; previous = null;
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [clip?.src, attempt]);
  useEffect(() => { playback.current?.update(); }, [playing]);
  const restart = () => { playback.current?.restart(); setPlaying(true); };
  return <div className="guide-preview guide-gif" data-playing={playing && status === 'ready'} data-status={status}>
    {clip?.poster && <img className="guide-gif-poster" src={clip.poster} alt="" aria-hidden="true" />}
    <canvas ref={canvas} width={clip?.width || 880} height={clip?.height || 520} className={status === 'ready' ? 'ready' : ''} role="img" aria-label={step.title + ' 사용 흐름 GIF'} />
    <div className="guide-gif-toolbar" role="group" aria-label="가이드 화면 재생 제어">
      <button type="button" disabled={status !== 'ready'} onClick={() => setPlaying(value => !value)} aria-label={playing ? '화면 GIF 일시정지' : '화면 GIF 재생'} title={playing ? '일시정지' : '이어 재생'}><PlaybackIcon kind={playing ? 'pause' : 'play'} /><span>{playing ? '일시정지' : '재생'}</span></button>
      <button type="button" disabled={status !== 'ready'} onClick={restart} aria-label="화면 GIF 처음부터 재시작" title="처음부터 재시작"><PlaybackIcon kind="restart" /><span>처음부터</span></button>
    </div>
    {status === 'loading' && <span className="guide-gif-status" role="status">화면 준비 중…</span>}
    {status === 'error' && <div className="guide-gif-status" role="status">화면을 불러오지 못했어요 <button type="button" onClick={() => setAttempt(value => value + 1)}>다시 불러오기</button></div>}
    <div className="guide-gif-progress" aria-hidden="true"><span ref={progress} /></div>
  </div>;
}
