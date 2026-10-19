import { exportBackup } from '../repositories/backup.js';
import { saveArtifactBackup } from '../platform/artifact-backup.js';
export async function download() {
  const backup=await exportBackup();
  await saveArtifactBackup({filename:'winmate-backup-'+new Date().toISOString().slice(0,10)+'.json',data:new Blob([JSON.stringify(backup)],{type:'application/json'})});
  return {keys:Object.keys(backup.local).length,databases:Object.keys(backup.databases).length};
}
