"""Check application/report files and the built frontend for configured secret values.
Never prints values. Generated runtime, dependencies and credential files are excluded.
"""
from pathlib import Path
import re,subprocess,sys
ROOT=Path(__file__).resolve().parents[2]
def main():
 secrets=[]
 for rel in ['poc/.env','app/.env']:
  p=ROOT/rel
  if not p.exists():continue
  for line in p.read_text().splitlines():
   m=re.match(r'\s*(?:export\s+)?([A-Za-z0-9_]*(?:KEY|TOKEN|PASSWORD|SECRET)[A-Za-z0-9_]*)\s*=\s*(.*?)\s*$',line,re.I)
   if m:
    value=m[2].strip().strip('"\'')
    if len(value)>=12:secrets.append((m[1],value.encode()))
 files=[]
 for base in [ROOT/'app',ROOT/'docs/migration']:
  for p in base.rglob('*'):
   if not p.is_file() or p.is_symlink():continue
   rel=p.relative_to(ROOT)
   if any(x in rel.parts for x in ['node_modules','.venv','runtime','output','legacy-work','__pycache__','.pytest_cache']):continue
   if p.name.startswith('.env') and p.name!='.env.example':continue
   files.append(p)
 failures=[]
 for p in files:
  raw=p.read_bytes()
  for name,value in secrets:
   if value in raw:failures.append({'path':str(p.relative_to(ROOT)),'setting':name})
 indexed=subprocess.check_output(['git','ls-files','-z'],cwd=ROOT).decode().split('\0')
 unsafe=[p for p in indexed if p and ((Path(p).name.startswith('.env') and Path(p).name!='.env.example') or p.startswith('app/data/runtime/'))]
 print({'files_checked':len(files),'configured_secrets_checked':len(secrets),'value_matches':failures,'unsafe_tracked_paths':unsafe})
 return 1 if failures or unsafe else 0
if __name__=='__main__':sys.exit(main())
