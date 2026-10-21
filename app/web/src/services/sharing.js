import { fetchResource } from '../api/client.js';
import { getProposal, onProposalChange, resolveImg, sharedProposal } from '../repositories/proposals.js';
import { documentChanges, applyDocumentChanges } from './share-patch.js';
import { packSharedAssets, registerSharedAssets } from './shared-assets.js';
import { getBootstrap } from '../api/bootstrap.js';
import { sharedIdentity } from './shared-path.js';
import { createShareHttp } from './share-http.js';
import { browserStorage } from '../repositories/browser.js';
import { isRemovedLayout, isPriorDefaultProposal } from '../domain/templates/migrate_removed_layouts.js';
import { needsCoverRefresh } from '../domain/templates/refresh_proposal_cover.js';

const sessions = new Map();
const preparing = new Map();
const OUTBOX = 'winmate.v2.shared-drafts';
let outbox;
try { outbox = JSON.parse(browserStorage.getItem(OUTBOX) || '{}'); if (!outbox || typeof outbox !== 'object' || Array.isArray(outbox)) outbox = {}; } catch { outbox = {}; }
const saveOutbox = () => { try { browserStorage.setItem(OUTBOX, JSON.stringify(outbox)); } catch { /* Local proposal still retains edits. */ } };

export function portableDocument(proposal) {
  const copy = JSON.parse(JSON.stringify(proposal, (key, value) => {
    if (['_share', 'sample', 'adaptation', 'removedLayoutArchive', 'coverArchive'].includes(key)) return undefined;
    if (typeof value === 'string' && value.startsWith('u:')) return resolveImg(value) || value;
    return value;
  }));
  delete copy.id; delete copy.endPath; delete copy._share; delete copy.sample; delete copy.exportedAt;
  return copy;
}

const api = createShareHttp(fetchResource);

class SharedSession {
  constructor(token, id) {
    this.token = token; this.id = id; this.listeners = new Set();
    this.state = { status: 'loading', snapshot: null, error: '', conflict: false };
    this.base = null; this.desired = null; this.sending = false; this.polling = false;
    const saved = outbox[token];
    if (saved) { this.base = saved.base; this.desired = saved.document; this.id = saved.id || id; }
    else {
      const local = id && getProposal(id);
      if (sharedIdentity(local)?.id === token) this.base = this.desired = portableDocument(local);
    }
  }
  subscribe(fn) { this.listeners.add(fn); fn(this.state); return () => this.listeners.delete(fn); }
  publish(patch) { this.state = { ...this.state, ...patch }; for (const fn of this.listeners) fn(this.state); }
  dirty() { return this.base && this.desired && documentChanges(this.base, this.desired).length > 0; }
  remember() {
    if (this.dirty()) outbox[this.token] = { base: this.base, document: this.desired, id: this.id };
    else delete outbox[this.token];
    saveOutbox();
  }
  install(snapshot) {
    const document = this.desired || snapshot.document;
    registerSharedAssets(document);
    const current = this.id && getProposal(this.id);
    if (current && current._share?.id === snapshot.token && current._share?.endPath === '/s/' + snapshot.token
      && current._share?.token === snapshot.token && (JSON.stringify(portableDocument(current)) === JSON.stringify(document)
        || (!this.dirty() && ((current.coverRevision && needsCoverRefresh(document)) || (current.authoringRevision && (isPriorDefaultProposal(document) || document.parts?.some(p => p.layouts?.some(x => isRemovedLayout(x.f))))))))
      && current._share?.revision === snapshot.revision && current._share?.canEdit === snapshot.canEdit
      && current._share?.permission === snapshot.permission && current._share?.isOwner === snapshot.isOwner) {
      this.publish({ snapshot, proposalId: this.id }); return;
    }
    const proposal = sharedProposal({ ...snapshot, document }, this.id);
    this.id = proposal.id;
    this.publish({ snapshot, proposalId: this.id });
  }
  accept(snapshot) {
    if (snapshot.revision < (this.state.snapshot?.revision || 0)) return;
    if (!this.dirty() && !this.sending) { this.base = snapshot.document; this.desired = snapshot.document; }
    this.install(snapshot);
    if (!this.dirty()) this.publish({ status: 'synced', error: '', conflict: false, httpStatus: null });
    else if (!snapshot.canEdit) this.publish({ status: 'blocked', error: '읽기전용으로 변경되었어요. 저장되지 않은 내 변경은 기기에 보관돼요.' });
    else if (!this.state.conflict && !this.sending) this.schedule();
  }
  schedule() {
    clearTimeout(this.timer);
    this.publish({ status: 'saving', error: '' });
    this.timer = setTimeout(() => this.flush(), 350);
  }
  changed(proposal) {
    this.desired = portableDocument(proposal); this.remember();
    if (!this.state.snapshot) {
      if (this.state.status !== 'offline') this.publish({ status: 'loading' });
      return;
    }
    if (!this.dirty()) { clearTimeout(this.timer); this.publish({ status: 'synced', error: '', conflict: false }); }
    else if (!this.state.conflict) this.schedule();
  }
  async flush() {
    clearTimeout(this.timer);
    if (this.sending || this.state.conflict) return;
    if (!this.dirty()) { this.publish({ status: 'synced', error: '' }); this.remember(); return; }
    this.sending = true;
    let sent;
    try {
      const desired = this.desired;
      sent = await packSharedAssets(desired);
      this.desired = applyDocumentChanges(sent, documentChanges(desired, this.desired));
      const snapshot = await api('/api/storyboards/' + this.token, { operations: documentChanges(this.base, sent) }, 'PATCH');
      const later = documentChanges(sent, this.desired);
      let rebased;
      try { rebased = later.length ? applyDocumentChanges(snapshot.document, later) : snapshot.document; }
      catch (error) {
        this.base = sent;
        this.install(snapshot); this.remember();
        this.publish({ status: 'conflict', error: error.message, conflict: true }); return;
      }
      this.base = snapshot.document;
      this.desired = rebased;
      this.install(snapshot); this.remember();
      this.publish({ status: this.dirty() ? 'saving' : 'synced', error: '', conflict: false });
    } catch (error) {
      if (error.status === 409) {
        const latest = error.latest || await api('/api/storyboards/' + this.token).catch(() => null);
        if (latest) this.install(latest);
        this.publish({ status: 'conflict', error: error.message, conflict: true });
      } else if (error.status === 403) {
        const latest = await api('/api/storyboards/' + this.token).catch(() => null);
        if (latest) this.install(latest);
        this.publish({ status: 'blocked', error: '읽기전용으로 변경되어 내 변경이 저장되지 않았어요. 내 변경은 기기에 보관돼요.' });
      } else this.publish({ status: 'offline', error: error.message, httpStatus: error.status });
      this.remember();
    } finally {
      this.sending = false;
      if (this.dirty() && this.state.status === 'saving') this.schedule();
    }
  }
  refresh() {
    if (this.refreshing) return this.refreshing;
    if (this.sending) return Promise.resolve();
    this.polling = true;
    this.refreshing = this.performRefresh().finally(() => { this.polling = false; this.refreshing = null; });
    return this.refreshing;
  }
  async performRefresh() {
    try {
      const current = this.state.snapshot;
      const version = current ? `${current.revision}-${current.permission}-${current.isOwner ? 1 : 0}-${current.hasEdited ? 1 : 0}` : '';
      const snapshot = await api('/api/storyboards/' + this.token + (version ? '?version=' + version : ''));
      if (!this.sending) {
        if (snapshot) this.accept(snapshot);
        else if (!this.dirty()) this.publish({ status: 'synced', error: '', httpStatus: null });
        else if (current?.canEdit && !this.state.conflict) this.schedule();
      }
    }
    catch (error) { this.publish({ status: 'offline', error: error.message, httpStatus: error.status }); }
  }
  start(snapshot) {
    if (snapshot) this.accept(snapshot); else this.refresh();
    if (!this.interval) this.interval = setInterval(() => {
      if (this.listeners.size || this.dirty()) void this.refresh();
    }, 1500);
  }
  async permission(permission) {
    const snapshot = await api('/api/storyboards/' + this.token + '/permission', { permission }, 'PATCH');
    this.accept(snapshot); return snapshot;
  }
  async resolve(keepMine) {
    const latest = await api('/api/storyboards/' + this.token);
    if (!keepMine) { this.base = latest.document; this.desired = latest.document; }
    else {
      const changes = documentChanges(this.base, this.desired);
      this.base = latest.document;
      this.desired = applyDocumentChanges(latest.document, changes, { force: true });
    }
    this.publish({ conflict: false, error: '' }); this.install(latest); this.remember();
    if (this.dirty()) this.schedule(); else this.publish({ status: 'synced' });
  }
}

export function connectShared(token, { id, snapshot, recoveredDraft } = {}) {
  let session = sessions.get(token);
  if (!session) {
    session = new SharedSession(token, id); sessions.set(token, session);
    if (recoveredDraft) {
      session.base = snapshot.document; session.desired = recoveredDraft;
      session.publish({ status:'conflict', conflict:true, error:'기기에 보관된 내용과 서버 원본이 달라요. 두 내용을 보존했어요. 반영할 내용을 선택해 주세요.' });
      session.remember();
    }
    session.start(snapshot);
  }
  return session;
}

export function ensureShared(proposal) {
  if (!preparing.has(proposal.id)) preparing.set(proposal.id, prepareShare(proposal).finally(() => preparing.delete(proposal.id)));
  return preparing.get(proposal.id);
}

function authenticatedOwner(proposal) {
  const user = getBootstrap().user;
  return !!user?.username && user.auth_enabled === true && !user.guest && proposal._share?.isOwner !== false;
}

async function prepareShare(proposal) {
  proposal = getProposal(proposal.id) || proposal;
  let stale;
  const identity = sharedIdentity(proposal);
  if (identity) {
    const session = connectShared(identity.id, { id:proposal.id });
    if (session.state.snapshot && !['loading','offline'].includes(session.state.status)) return session;
    await session.refresh();
    if (session.state.httpStatus !== 404 || !authenticatedOwner(proposal)) return session;
    stale = session;
  }
  const current = getProposal(proposal.id) || proposal;
  const before = portableDocument(current);
  const document = stale?.dirty() ? stale.desired : before;
  let snapshot, packed;
  if (authenticatedOwner(proposal)) {
    try { snapshot = await api('/api/history/' + encodeURIComponent(proposal.id)); }
    catch (error) { if (error.status !== 404) throw error; }
  }
  // Resolve an existing original before touching uploads or sending a large request.
  if (!snapshot || stale) packed = await packSharedAssets(document);
  if (!snapshot) snapshot = await api('/api/storyboards', { source:proposal.id, document:packed });
  const latest = getProposal(proposal.id);
  const pending = latest ? documentChanges(before, portableDocument(latest)) : [];
  const different = stale && documentChanges(snapshot.document, packed).some(change => !['createdAt','updatedAt'].includes(change.path[0]));
  const session = connectShared(snapshot.token, { id:proposal.id, snapshot, recoveredDraft:different ? packed : undefined });
  if (pending.length) {
    session.desired = applyDocumentChanges(session.desired || snapshot.document, pending, { force:true });
    session.install(snapshot); session.remember();
    if (!session.state.conflict) session.schedule();
  }
  if (stale && stale !== session) {
    clearInterval(stale.interval); clearTimeout(stale.timer); sessions.delete(stale.token);
    delete outbox[stale.token]; saveOutbox();
    if (window.location.pathname === '/s/' + stale.token) window.history.replaceState(window.history.state, '', '/s/' + snapshot.token);
  }
  return session;
}

/** Every owned history receives its stable server identity, without blocking the UI. */
export async function prepareHistorySharing(proposals) {
  const queue = proposals.filter(authenticatedOwner);
  const results = [];
  await Promise.all(Array.from({ length:Math.min(2,queue.length) }, async () => {
    while (queue.length) {
      const proposal = queue.shift();
      try { const session = await ensureShared(getProposal(proposal.id) || proposal); results.push({ id:proposal.id, status:session.state.status }); }
      catch { results.push({ id:proposal.id, status:'offline' }); }
    }
  }));
  return results;
}

export const prepareSampleSharing = prepareHistorySharing;

onProposalChange((proposal, previous, options) => {
  if (options?.remote) return;
  const identity = sharedIdentity(proposal);
  if (identity) connectShared(identity.id, { id: proposal.id }).changed(proposal);
});

window.addEventListener('online', () => { for (const session of sessions.values()) session.refresh(); });
window.addEventListener('beforeunload', event => {
  if ([...sessions.values()].some(session => session.dirty())) { event.preventDefault(); event.returnValue = ''; }
});
