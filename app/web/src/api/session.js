// One shared state controls the single login surface and every write request.
import { useSyncExternalStore } from 'react';
let state = { ready: false, guest: false, modal: false };
const listeners = new Set();
const emit = patch => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
export const sessionSnapshot = () => state;
export const useSession = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, sessionSnapshot);
export function configureSession(user) { emit({ ready: true, guest: !!user?.guest, modal: false }); }
export function showLogin() { emit({ guest: true, modal: true }); }
export function closeLogin() { emit({ modal: false }); }
export function requireLogin() {
  if (!state.ready || !state.guest) return true;
  showLogin(); return false;
}
// Guests may browse everything but cannot take files away (PPTX · report · image · HTML exports).
export function requireDownload() { return requireLogin(); }
export function loginRequiredError() {
  return Object.assign(new Error('로그인 후 파일을 받을 수 있어요.'), { code: 'login_required' });
}
