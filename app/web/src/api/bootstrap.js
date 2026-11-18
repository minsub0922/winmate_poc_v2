import { requestJson } from './client.js';
import { sharedToken } from '../services/shared-path.js';
import { configureResourceSwitches } from './resource-switches.js';
let snapshot;
export async function loadBootstrap() { const token = sharedToken(); snapshot = await requestJson(token ? `/api/storyboards/${token}/bootstrap` : '/api/bootstrap'); configureResourceSwitches(snapshot.resource_switches); return snapshot; }
export function configureBootstrap(value) { snapshot = value; configureResourceSwitches(value?.resource_switches); }
export function getBootstrap() {
  if (!snapshot) throw new Error('앱 데이터를 먼저 준비해야 합니다.');
  return snapshot;
}
