// 포트 · 바인딩 값 읽기 — 기본값은 루트 .env.example 「포트 · 바인딩」 구역에만 있다(코드에 숫자를 두지 않는다).
// 우선순위: 실행 환경 > .env > .env.example (셸 쪽 짝: app/scripts/ports.sh)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function fromFile(name, key) {
  let text;
  try { text = fs.readFileSync(path.join(root, name), 'utf8'); } catch { return ''; }
  let value = '';
  for (const line of text.split(/\r?\n/)) {
    const entry = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (entry?.[1] !== key) continue;
    const raw = entry[2], quoted = raw.match(/^(["'])(.*)\1$/);
    value = quoted ? quoted[2] : raw.split(' #', 1)[0].trimEnd();
  }
  return value;
}

export function envValue(key) {
  const value = process.env[key] || fromFile('.env', key) || fromFile('.env.example', key);
  if (!value) throw new Error(`${key} 값이 없습니다 — 루트 .env.example의 「포트 · 바인딩」 구역을 확인하세요.`);
  return value;
}

export function envPort(key) {
  const value = envValue(key), port = Number(value);
  if (!/^\d+$/.test(value) || port < 1 || port > 65535) throw new Error(`${key}는 1~65535 정수여야 합니다.`);
  return port;
}

export function inhouseMode() {
  const value = process.env.WINMATE_INHOUSE ?? fromFile('.env', 'WINMATE_INHOUSE');
  return /^(1|on|true|yes)$/i.test(value.trim());
}
