import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
export async function proposalRenderRevision(root){
 const files=['app/data/layouts.b64','app/web/src/services/catalog.js','app/web/src/domain/templates/layout_repairs.js','app/web/src/domain/templates/proposal_typography.js','app/web/src/domain/templates/proposal_typography.json','app/web/src/domain/templates/photo_layouts.js','app/web/src/domain/templates/std_layouts.js','app/web/src/domain/slides/Slide.jsx','app/web/src/domain/slides/export-pptx.js','app/web/src/services/fill.js','app/web/src/services/packs.js','app/tests/fixtures/slide-geometry.mjs'];
 files.push(...['scenarios.js','scenario_fills.js','scenario_covers.json','scenario_bg.js','scenario_bg.json','scenario_storyboard.js','scenario_story.js'].map(f=>'app/web/src/domain/templates/'+f));
 files.push(...(await fs.readdir(path.join(root,'app/web/src/styles'))).filter(f=>f.endsWith('.css')).map(f=>'app/web/src/styles/'+f));
 const hash=createHash('sha256').update('mounted-react-geometry-v1');
 for(const file of files.sort())hash.update(file).update(await fs.readFile(path.join(root,file)));
 return hash.digest('hex');
}
