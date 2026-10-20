/** Browser storage boundary. Names, versions and serialization match the artifact. */
let backend = {
  local: { getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value), removeItem: key => window.localStorage.removeItem(key) },
  open: (name, version) => window.indexedDB.open(name, version),
};
let namespace = '', observer = null;
const scoped = key => namespace ? namespace + key : key;
export function configureUserStorage(user) {
  namespace = user?.tracking_enabled && user?.username !== user?.storage_legacy_owner
    ? 'winmate.account.' + encodeURIComponent(user?.username || 'guest') + ':' : '';
}
export const onStorageWrite = handler => { observer = handler; };
export const browserStorage = {
  getItem: key => backend.local.getItem(scoped(key)),
  setItem: (key, value) => { backend.local.setItem(scoped(key), value); observer?.(key,value); },
  removeItem: key => { backend.local.removeItem(scoped(key)); observer?.(key,null); },
};
export const openDatabase = (name, version = 1) => backend.open(scoped(name), version);
export function configureStorage(next) { backend = next; }
export const STORAGE_KEYS = [
  'winmate.v2.proposals', 'winmate.v2.ui', 'winmate.v2.history-preferences', 'winmate.v2.seedv', 'winmate.v2.reviews',
  'winmate.v2.reviews.seedv', 'winmate.v2.sims', 'winmate.v2.sims.seedv',
  'winmate.v2.simPersonas', 'winmate.v2.favs', 'wm-linkmeta-v1',
  'winmate.v2.jobs','winmate.v2.shared-drafts',
];
export const DATABASES = {
  'winmate-requirements': { sources: {} },
  'winmate-v2': { img: {} },
  'winmate-v2-review': { docs: {} },
  'winmate-my': { tpl: { keyPath: 'f' }, img: {} },
};
