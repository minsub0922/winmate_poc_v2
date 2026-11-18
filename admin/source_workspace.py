"""Build selected source changes beside the repository and promote verified files with a recovery journal."""
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile

from .engine import EngineError
from .store import dump


def file_hash(path):
    if not path.is_file():
        return None
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def replace_from(src, dest):
    dest.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix='.source-review-', dir=dest.parent)
    os.close(fd)
    try:
        shutil.copy2(src, name)
        os.replace(name, dest)
    finally:
        Path(name).unlink(missing_ok=True)


@contextmanager
def publication_lock(home):
    home.mkdir(parents=True, exist_ok=True)
    with (home / 'publish.lock').open('a') as f:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX)
        yield


class SourceWorkspace:
    def __init__(self, root, directory):
        self.root, self.dir = Path(root), Path(directory)
        self.tree = self.dir / 'stage'
        self.tree.mkdir(parents=True)
        self.before = {}
        self.targets = set()
        # Only public catalog inputs are exposed to the two existing projection builders.
        for name in ('img','reference','poc','node_modules'):
            self.link(name)
        self.shallow('build', {'media'})
        self.shallow('build/media', {'data'})
        self.shallow('build/media/data')
        for name in ('web','api'):
            self.link('app/' + name)
        scripts = ('prepare_data.py','export_agent_data.mjs')
        self.shallow('app/scripts', scripts)
        for name in scripts:
            rel = 'app/scripts/' + name
            if (self.root / rel).is_file():
                p = self.tree / rel
                p.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(self.root / rel, p)
        self.shallow('app/data', {'runtime','product-details'})
        self.shallow('app/data/product-details')
        self.shallow('proddb', {'winmate_products.sqlite','ecat','raw','dss','reviews'})
        self.shallow('proddb/raw')
        self.shallow('proddb/ecat', {'text'})
        self.shallow('proddb/ecat/text')
        self.shallow('proddb/dss')
        # No account databases or app runtime state are copied.
        (self.tree / 'app/data/runtime').mkdir(parents=True, exist_ok=True)

    def link(self, rel):
        src, dst = self.root / rel, self.tree / rel
        if src.exists():
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.symlink_to(src.resolve(), target_is_directory=src.is_dir())

    def shallow(self, rel, exclude=()):
        (self.tree / rel).mkdir(parents=True, exist_ok=True)
        path = self.root / rel
        for child in path.iterdir() if path.is_dir() else []:
            if child.name not in exclude and not child.name.startswith('.'):
                self.link(rel + '/' + child.name)

    def watch(self, rel):
        if rel not in self.before:
            self.before[rel] = file_hash(self.root / rel)

    def read(self, rel, default=None):
        self.watch(rel)
        path = self.tree / rel
        return json.loads(path.read_text()) if path.is_file() else default

    def put(self, rel, data, raw=False):
        self.watch(rel)
        path = self.tree / rel
        if not path.parent.resolve().is_relative_to(self.tree.resolve()):
            raise EngineError('작업 공간 밖에는 파일을 쓸 수 없습니다.')
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.is_symlink():
            path.unlink()
        path.write_text(data if raw else dump(data) + '\n', encoding='utf-8')
        self.targets.add(rel)

    def generated(self, rel):
        path = self.tree / rel
        if path.is_symlink() or not path.is_file():
            raise EngineError('생성된 자료를 확인할 수 없습니다: ' + rel)
        self.targets.add(rel)

    def publish(self):
        for rel, h in self.before.items():
            if file_hash(self.root / rel) != h:
                raise EngineError('반영 중 원본 자료가 갱신됐습니다. 최신 결과에서 다시 시도해 주세요: ' + rel)
        journal = []
        for rel in sorted(self.targets):
            h = self.before.get(rel)
            after = file_hash(self.tree / rel)
            if h == after:
                continue
            dest = self.root / rel
            if h is not None:
                backup = self.dir / 'before' / rel
                backup.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(dest, backup)
            journal.append({'path':rel, 'before':h, 'after':after})
        pending = self.dir / 'journal.tmp'
        pending.write_text(dump(journal))
        pending.replace(self.dir / 'journal.json')
        for entry in journal:
            rel = entry['path']
            replace_from(self.tree / rel, self.root / rel)


def recover(root, directory, store):
    for journal in directory.glob('*/journal.json'):
        if not store.one('SELECT id FROM source_review_batches WHERE id=?', (journal.parent.name,)):
            for entry in reversed(json.loads(journal.read_text())):
                dst = root / entry['path']
                if file_hash(dst) != entry['after']:
                    continue
                if entry['before'] is None:
                    dst.unlink(missing_ok=True)
                else:
                    replace_from(journal.parent / 'before' / entry['path'], dst)
        shutil.rmtree(journal.parent)
