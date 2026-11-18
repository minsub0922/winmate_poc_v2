// Publish the same floor shells and furnished floors the building studio starts with.
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { PRESETS, presetFloors } from '../web/src/building/presets.js';
import { STD_PRESETS } from '../web/src/building/presets-standard.js';
import { STANDARD_BAKE } from '../web/src/building/bake-standard.js';

const bake = fs.readFileSync(new URL('../web/src/building/bake.b64', import.meta.url), 'utf8').trim();
const sources = [bake, STANDARD_BAKE].map(s => JSON.parse(gunzipSync(Buffer.from(s, 'base64'))));
const floors = new Map(sources.flatMap(source => source.tpl.map(f => [f.id, f])));
const presets = [...STD_PRESETS, ...PRESETS].map(p => ({
  id: p.id, title: p.title, industry: p.ind, template: p.id, view: {mode: 'exterior'},
  floors: presetFloors(p, id => floors.get(id), i => p.id + '-f' + i),
}));
const version = createHash('sha256').update(bake).update(STANDARD_BAKE).update(JSON.stringify(presets)).digest('hex').slice(0, 12);
const path = new URL('../data/spatial/building-presets.json', import.meta.url);
const contents = JSON.stringify({version, presets, floors: [...floors.keys()]}) + '\n';
if (!fs.existsSync(path) || fs.readFileSync(path, 'utf8') !== contents) fs.writeFileSync(path, contents);
