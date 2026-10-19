/** Browser storage boundary. Names, versions and serialization match the artifact. */
let backend = {
  local: { getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value), removeItem: key => window.localStorage.removeItem(key) },
  open: (name, version) => window.indexedDB.open(name, version),
};
export const browserStorage = {
  getItem: key => backend.local.getItem(key),
  setItem: (key, value) => backend.local.setItem(key, value),
  removeItem: key => backend.local.removeItem(key),
};
export const openDatabase = (name, version = 1) => backend.open(name, version);
export function configureStorage(next) { backend = next; }
export const STORAGE_KEYS = [
  'winmate.v2.proposals', 'winmate.v2.ui', 'winmate.v2.seedv', 'winmate.v2.reviews',
  'winmate.v2.reviews.seedv', 'winmate.v2.sims', 'winmate.v2.sims.seedv',
  'winmate.v2.simPersonas', 'winmate.v2.favs', 'wm-linkmeta-v1',
];
export const DATABASES = {
  'winmate-v2': { img: {} },
  'winmate-v2-review': { docs: {} },
  'winmate-my': { tpl: { keyPath: 'f' }, img: {} },
};
