// A small byte-range index lets the existing pack loader fetch individual images.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const folder = path.join(root, 'img/lib');
const index = JSON.parse(await fs.readFile(path.join(folder, 'index.json'), 'utf8'));
const names = [...new Set(index.images.map(image => image.a.split('#')[0]).filter(name => name.startsWith('img/lib/')))];
const packs = {};
for (const name of names) {
  const bytes = await fs.readFile(path.join(root, name));
  const images = JSON.parse(bytes.toString('utf8')).images;
  let cursor = 0;
  packs[name] = images.map(image => {
    const encoded = Buffer.from(JSON.stringify(image));
    const start = bytes.indexOf(encoded, cursor);
    if (start < 0 || !image.startsWith('data:')) throw new Error('Invalid image range in ' + name);
    cursor = start + encoded.length;
    return [start + 1, cursor - 1];
  });
}
const output = JSON.stringify({ version: 1, packs });
const target = path.join(folder, 'ranges.json');
if (await fs.readFile(target, 'utf8').catch(() => '') !== output) await fs.writeFile(target, output);
console.log('Image ranges ready: ' + names.length + ' packs, ' + Object.values(packs).reduce((count, images) => count + images.length, 0) + ' images');
