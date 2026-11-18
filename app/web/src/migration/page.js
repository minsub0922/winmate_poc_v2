import { exportBackup, importBackup } from '../repositories/backup.js';
import { configureUserStorage } from '../repositories/browser.js';
import { requestJson } from '../api/client.js';
import { downloadBlob } from '../platform/runtime.js';
const status = document.querySelector('#status');

async function selectAccount() {
  const session = await requestJson('/api/auth/status', { cache: 'no-store' });
  if (session.enabled && !session.authenticated) throw new Error('이전할 계정으로 로그인해 주세요.');
  configureUserStorage(session.user);
}

document.querySelector('#export').onclick = async () => {
  try {
    status.textContent = '내보내는 중…';
    await selectAccount();
    const backup = await exportBackup();
    await downloadBlob({ filename: 'winmate-backup.json', data: new Blob([JSON.stringify(backup)], { type: 'application/json' }) });
    status.textContent = '이 브라우저의 데이터와 이미지를 내보냈습니다.';
  } catch (error) { status.textContent = error.message; }
};
document.querySelector('#import').onclick = async () => {
  const file = document.querySelector('#file').files[0];
  if (!file) { status.textContent = '백업 JSON 파일을 골라 주세요.'; return; }
  try {
    status.textContent = '가져오는 중…';
    await selectAccount();
    const result = await importBackup(JSON.parse(await file.text()));
    status.textContent = `완료: 저장소 키 ${result.keys}개, 문서·템플릿·이미지 ${result.records}개. 앱을 새로 열면 반영됩니다.`;
  } catch (error) { status.textContent = '가져오지 못했습니다: ' + error.message; }
};
