import {build} from 'esbuild';
await build({entryPoints:['src/migration/export.js'],bundle:true,format:'iife',globalName:'WinmateBackup',outfile:'dist/migration-export.js',target:['chrome110','safari16'],minify:false});
