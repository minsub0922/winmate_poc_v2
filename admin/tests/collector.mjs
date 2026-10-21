import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const directory = path.resolve('admin/runtime/evidence/collector-contract');
fs.mkdirSync(directory, { recursive: true });
execFileSync(process.execPath, ['admin/collect.mjs', directory], { env: { ...process.env, WINMATE_ADMIN_COLLECTOR_COMPILE_ONLY: '1' }, stdio: 'inherit' });
execFileSync(process.execPath, ['--check', path.join(directory, 'collector.mjs')], { stdio: 'inherit' });
const code = fs.readFileSync(path.join(directory, 'collector.mjs'), 'utf8');
for (const expected of ['Incomplete pagination', 'Count mismatch', 'discovery.json', 'Empty spec response requires review', 'process.exitCode = 2']) {
  if (!code.includes(expected)) throw Error('Missing collector protection: ' + expected);
}
console.log('Collector adapter contract and generated JavaScript syntax passed');
