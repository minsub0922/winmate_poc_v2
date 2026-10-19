/** Only the standalone legacy-origin backup exporter needs the artifact host. */
import {downloadBlob} from './runtime.js';
export async function saveArtifactBackup(options) {
  if(window.claude?.use) {
    const downloads=await window.claude.use('downloads');
    if(downloads?.save)return downloads.save(options);
  }
  return downloadBlob(options);
}
