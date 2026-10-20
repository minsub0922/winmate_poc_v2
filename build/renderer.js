// Runs inside the browser page. Renders .dc.html sources to static DOM.
window.__DC = (function () {
  class DCLogic {
    constructor(props) { this.props = props || {}; if (this.state === undefined) this.state = null; }
    setState() {} forceUpdate() {}
  }
  const HOLE = /\{\{\s*([^}]*?)\s*\}\}/g;
  const WHOLE = /^\s*\{\{\s*([^}]*?)\s*\}\}\s*$/;
  function lookup(path, scope) {
    path = path.trim();
    if (path === 'true') return true; if (path === 'false') return false;
    if (path === 'null') return null; if (path === 'undefined') return undefined;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    if (/^(['"]).*\1$/.test(path)) return path.slice(1, -1);
    let v = scope;
    for (const k of path.split('.')) { if (v == null) return undefined; v = v[k]; }
    return v;
  }
  function str(v) { if (v == null || v === false) return ''; if (typeof v === 'function') return ''; if (typeof v === 'object') return Array.isArray(v) ? v.join(', ') : ''; return String(v); }
  function interp(s, scope) { return s.replace(HOLE, (_, p) => str(lookup(p, scope))); }
  const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const parsed = {};
  function parse(name, src) {
    if (parsed[name]) return parsed[name];
    const doc = new DOMParser().parseFromString(src, 'text/html');
    const xdc = doc.querySelector('x-dc');
    const h = xdc && xdc.querySelector('helmet'); if (h) h.remove();
    const sc = doc.querySelector('script[data-dc-script]');
    let Comp = null, propsDef = {};
    if (sc) {
      try { Comp = new Function('DCLogic', sc.textContent + '\n;return Component;')(DCLogic); } catch (e) { console.warn('compile', name, e.message); }
      try { propsDef = JSON.parse(sc.getAttribute('data-props') || '{}'); } catch (e) {}
    }
    const title = (doc.querySelector('title') || {}).textContent || '';
    return (parsed[name] = { xdc, Comp, propsDef, title });
  }
  let REG = {}, ERR = [];
  function render(name, props) {
    const src = REG[name]; if (!src) { ERR.push('missing ' + name); return null; }
    const p = parse(name, src);
    let vals = {};
    if (p.Comp) { try { const inst = new p.Comp(props || {}); vals = inst.renderVals() || {}; } catch (e) { ERR.push(name + ': ' + e.message); } }
    const frag = document.createDocumentFragment();
    for (const n of Array.from(p.xdc.childNodes)) expand(n, vals, frag);
    return frag;
  }
  function expand(node, scope, parent) {
    if (node.nodeType === 3) { const t = node.data; parent.appendChild(document.createTextNode(t.indexOf('{{') >= 0 ? interp(t, scope) : t)); return; }
    if (node.nodeType !== 1) return;
    const tag = node.localName;
    if (tag === 'sc-for') {
      const listAttr = node.getAttribute('list') || ''; const m = listAttr.match(WHOLE);
      const list = m ? lookup(m[1], scope) : null; const as = node.getAttribute('as') || 'item';
      if (Array.isArray(list)) list.forEach((it, i) => { const s2 = Object.assign({}, scope, { [as]: it, $index: i }); for (const c of Array.from(node.childNodes)) expand(c, s2, parent); });
      return;
    }
    if (tag === 'sc-if') {
      const va = node.getAttribute('value') || ''; const m = va.match(WHOLE);
      const v = m ? lookup(m[1], scope) : va;
      if (v) for (const c of Array.from(node.childNodes)) expand(c, scope, parent);
      return;
    }
    if (tag === 'dc-import') {
      const name = node.getAttribute('name'); const props = {};
      for (const a of Array.from(node.attributes)) {
        if (a.name === 'name' || a.name.startsWith('hint-')) continue;
        const m = a.value.match(WHOLE); props[camel(a.name)] = m ? lookup(m[1], scope) : interp(a.value, scope);
      }
      const frag = render(name, props);
      if (frag) {
        const root = Array.from(frag.childNodes).find((n) => n.nodeType === 1);
        if (root && /^(Img|Photo|Prod)$/.test(name)) {
          root.setAttribute('data-slot', name);
          if (props.kind) root.setAttribute('data-kind', String(props.kind));
          if (props.hint) root.setAttribute('data-hint', String(props.hint));
          if (props.pid && props.pid !== 'none') root.setAttribute('data-pid', String(props.pid));
        }
        parent.appendChild(frag);
      }
      return;
    }
    const el = node.namespaceURI === 'http://www.w3.org/1999/xhtml' ? document.createElement(tag) : document.createElementNS(node.namespaceURI, node.tagName);
    for (const a of Array.from(node.attributes)) {
      if (/^on/i.test(a.name)) continue;
      const m = a.value.match(WHOLE);
      if (m) { const v = lookup(m[1], scope); if (v == null || v === false || typeof v === 'function' || (typeof v === 'object')) continue; el.setAttribute(a.name, String(v)); }
      else el.setAttribute(a.name, a.value.indexOf('{{') >= 0 ? interp(a.value, scope) : a.value);
    }
    for (const c of Array.from(node.childNodes)) expand(c, scope, el);
    parent.appendChild(el);
  }
  return {
    setRegistry(r) { REG = r; for (const k in parsed) delete parsed[k]; },
    renderTop(name) { ERR = []; const frag = render(name, {}); const host = document.createElement('div'); if (frag) host.appendChild(frag); const root = Array.from(host.childNodes).find((n) => n.nodeType === 1); return { root, errors: ERR.slice(), title: parsed[name] ? parsed[name].title : '' }; }
  };
})();
