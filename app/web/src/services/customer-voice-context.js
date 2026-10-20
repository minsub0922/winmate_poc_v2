import { useEffect, useRef } from 'react';
import { getProposal, loadUi, stageOf } from '../repositories/proposals.js';
import { getReview } from '../repositories/reviews.js';
import { getSim } from '../repositories/simulations.js';
import { jobsOf } from '../repositories/jobs.js';
import { trackingHeaders } from './telemetry.js';

const providers = new Map();
const privateKey = /password|passwd|authorization|cookie|api[_-]?key|secret|(?:access|refresh|session|share)[_-]?token|^token$/i;
let lastControl = null;
const ignored = element => element?.closest?.('[data-customer-voice],.sidebar,.login-prompt,[autocomplete="current-password"],[autocomplete="new-password"]');
const visible = element => !!element.getClientRects().length && !ignored(element);
export function useWorkContext(name, read) {
  const current = useRef(read); current.current = read;
  useEffect(() => { const key = Symbol(name); providers.set(key, { name, read: () => current.current() }); return () => providers.delete(key); }, [name]);
}
export function watchWorkFocus() {
  const track = event => { if (event.target instanceof Element && !ignored(event.target)) lastControl = event.target; };
  document.addEventListener('focusin', track, true); document.addEventListener('pointerdown', track, true);
  return () => { document.removeEventListener('focusin', track, true); document.removeEventListener('pointerdown', track, true); };
}
function pathOf(element) {
  if (!element || !element.isConnected) return '';
  if (element.id) return '#' + CSS.escape(element.id);
  const path = [];
  for (let node = element; node && node !== document.body && path.length < 5; node = node.parentElement) {
    let part = node.tagName.toLowerCase();
    if (node.classList.length) part += '.' + [...node.classList].slice(0, 2).map(name => CSS.escape(name)).join('.');
    if (node.hasAttribute('data-tb')) part += `[data-tb="${node.getAttribute('data-tb')}"]`;
    else if (node.hasAttribute('data-img')) part += `[data-img="${node.getAttribute('data-img')}"]`;
    else if (node.parentElement) part += ':nth-child(' + ([...node.parentElement.children].indexOf(node) + 1) + ')';
    path.unshift(part);
  }
  return path.join(' > ');
}
function fieldOf(element) {
  if (!element?.isConnected || element.matches('input[type="password"],[autocomplete*="password"]')) return null;
  const label = element.getAttribute('aria-label') || element.labels?.[0]?.textContent?.trim() || element.getAttribute('placeholder') || '';
  if (privateKey.test(element.name || '') || privateKey.test(element.id || '')) return null;
  const field = { path: pathOf(element), label, tag: element.tagName.toLowerCase(), type: element.type || '', disabled: !!element.disabled };
  if (element.type === 'file') field.files = [...(element.files || [])].map(file => ({ name: file.name, bytes: file.size, type: file.type }));
  else if (element.matches('input[type="checkbox"],input[type="radio"]')) field.checked = element.checked;
  else if (element.matches('input,textarea,select')) { field.value = element.value; field.selection = typeof element.selectionStart === 'number' ? { start: element.selectionStart, end: element.selectionEnd } : null; }
  else if (element.isContentEditable) field.value = element.textContent;
  return field;
}
function safeString(value) {
  return value.replace(/AIza[\w-]{20,}/g, '[redacted]')
    .replace(/(\/s\/)[A-Za-z0-9_-]{12,}/g, '$1[shared]')
    .replace(/((?:api[_-]?key|password|authorization|access_token|refresh_token)\s*[=:]\s*)[^\s,;&]+/gi, '$1[redacted]');
}
/** Bound size explicitly; omitted large fields remain identified instead of blocking feedback. */
function bounded(value) {
  let remaining = 76000; const seen = new WeakSet(), omitted = [];
  const walk = (item, path = '', depth = 0) => {
    if (remaining <= 0 || depth > 20) { omitted.push(path); return '[omitted: snapshot limit]'; }
    if (typeof item === 'string') {
      if (/^data:/.test(item)) return '[embedded media omitted: ' + item.length + ' characters]';
      const text = safeString(item), length = Math.min(24000, remaining);
      remaining -= Math.min(text.length, length);
      if (text.length > length) { omitted.push(path); return text.slice(0, length) + `… [${text.length - length} characters omitted]`; }
      return text;
    }
    if (!item || ['number', 'boolean'].includes(typeof item)) { remaining -= 16; return typeof item === 'number' && !Number.isFinite(item) ? null : item; }
    if (typeof item !== 'object') return undefined;
    if (seen.has(item)) return '[repeated object]'; seen.add(item);
    if (Array.isArray(item)) {
      const result = item.slice(0, 250).map((value, index) => walk(value, path + '[' + index + ']', depth + 1));
      if (item.length > 250) { omitted.push(path); result.push({ omitted_items: item.length - 250 }); }
      return result;
    }
    const result = {};
    for (const [key, value] of Object.entries(item).slice(0, 150)) { remaining -= key.length + 4; result[key] = privateKey.test(key) ? '[redacted]' : walk(value, path + '.' + key, depth + 1); }
    return result;
  };
  const result = walk(value);
  result.capture_limits = { omitted: omitted.slice(0, 80), truncated: omitted.length > 0 };
  return result;
}

export function captureWorkContext(route) {
  const contexts = {};
  for (const provider of providers.values()) { try { contexts[provider.name] = provider.read(); } catch (error) { contexts[provider.name] = { capture_error: error.message }; } }
  const proposal = route.name === 'proposal' ? getProposal(route.id) : contexts.proposal?.state;
  const state = proposal || (route.name === 'review' ? getReview(route.id) : route.name === 'sim' && route.id ? getSim(route.id) : contexts.spatial?.state);
  const work = { type: proposal ? 'proposal' : route.name === 'sim' ? 'simulation' : contexts.layout_editor ? 'layout' : route.name,
    id: proposal?.id || route.id || contexts.spatial?.id || contexts.layout_editor?.f || null,
    stage: proposal ? stageOf(proposal) : state?.status || contexts.spatial?.status || (contexts.layout_editor ? 'editing' : null), state: state || null };
  if (work.id) work.jobs = jobsOf(work.type, work.id);
  const roots = [...document.querySelectorAll('.main,[role="dialog"]')].filter(visible)
    .sort((a, b) => Number(b.getAttribute('role') === 'dialog') - Number(a.getAttribute('role') === 'dialog'));
  const controls = [...new Set(roots.flatMap(root => [...root.querySelectorAll('input,textarea,select,[contenteditable="true"]')]))]
    .filter(visible).slice(0, 100).map(fieldOf).filter(Boolean);
  const nodes = [...new Set(roots.flatMap(root => [root, ...root.querySelectorAll('*')]))].slice(0, 20000);
  const scroll = nodes.filter(element => visible(element) && (element.scrollHeight > element.clientHeight + 2 || element.scrollWidth > element.clientWidth + 2))
    .filter(element => /auto|scroll/.test(getComputedStyle(element).overflow + getComputedStyle(element).overflowY + getComputedStyle(element).overflowX))
    .slice(0, 40).map(element => ({ path: pathOf(element), label: element.getAttribute('aria-label') || '', top: element.scrollTop, left: element.scrollLeft,
      height: element.clientHeight, width: element.clientWidth, contentHeight: element.scrollHeight, contentWidth: element.scrollWidth }));
  const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(visible).map(element => ({ label: element.getAttribute('aria-label') || element.querySelector('h2,h3')?.textContent,
    path: pathOf(element), modal: element.getAttribute('aria-modal') }));
  const selected = [...document.querySelectorAll('[aria-selected="true"],[aria-pressed="true"],.ed-sel')].filter(visible).slice(0, 40)
    .map(element => ({ path: pathOf(element), label: element.getAttribute('aria-label') || element.textContent?.slice(0, 150) }));
  // Work identifiers and UI position precede large documents so they always fit the snapshot.
  return bounded({ captured_at: new Date().toISOString(), route: { ...route, token: route.token ? '[redacted]' : undefined }, path: location.pathname,
    work: { type: work.type, id: work.id, stage: work.stage },
    jobs: (work.jobs || []).map(job => ({ id: job.id, status: job.status, purpose: job.purpose, stage: job.stage, progress: job.progress, owner: job.owner, outcome: job.outcome })),
    request_context: trackingHeaders('customer-voice'),
    viewport: { width: innerWidth, height: innerHeight, pixelRatio: devicePixelRatio, zoom: visualViewport?.scale || 1 },
    scroll: { window: { x: scrollX, y: scrollY }, containers: scroll },
    ui: { dialogs, selected, focused: fieldOf(lastControl), controls, heading: document.querySelector('.main h1')?.textContent,
      selection: window.getSelection()?.toString().slice(0, 2000) || '', preferences: loadUi() },
    contexts, state: work.state, job_details: work.jobs || [] });
}
