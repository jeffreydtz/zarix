"""Shared guards for this new synthetic extension; never persist credential values."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile

REPO = Path('/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix')
RUNTIME = Path('/tmp/zarix-runtime-20261015')
REVISION = 'f5f362ee9dbb81da5268049cab41b357d90eccf1'
CHECKPOINT = '23d91aeda8a22903d2bd795dd4ce9f3970ea1b5b'
SOURCE_SHA = '6c108712a7d338b4c6c1d14dca798921637abc9e5f2aa3009318fdf7b24e3a29'
DATABASE = 'zarix_delta_e4bd026f703549bfa24de940134184b8'
BASE = REPO / 'docs/tif/v2.13/evidence/technical-20261015/implementation-gap-closure'
PRIOR = RUNTIME / 'implementation-delta-a29a07a8-3b5a-4b66-a16e-bebf2f974cfe'
PROTECTED = {
    REPO / 'docs/tif/v2.13/casos_prueba.csv': '887adbef81be56f781133ced65bee1c92effcf9af9a3e0b1b389eed0e4e2717d',
    REPO.parent / 'zarix-private-final-20261015T070553Z/checkpoint.private.json': 'f378869280ad473b096630ed45ac839fcf822a6735f9dea1598dffaf3ca41a24',
    REPO.parent / 'zarix-private-final-20261015T070553Z/stacks/proof/database.dump': 'b2006c91a87a039e9cfa5d87995c622d62dd8a59596f916718f356383a350a0a',
    REPO.parent / 'zarix-private-delta-20261015T081955Z/database.dump': 'a9f03e0b2c4e91b30212fe8acda7267c64483d982b0b9971b3bf6317ef440bd1',
    REPO.parent / 'zarix-private-cnf13-20261015T083636Z/database.dump': '1f958b0273576ef9bd488a5ffde575f93f12f5eae3e67ce2114862a19726deaf',
    BASE / 'native-delta/native-delta-final-manifest.json': '5342ebfdb8e5e2b6a96d642d716b9993db453eaa6c4861172d393e28e47182a1',
}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def save(path, value):
    with Path(path).open('x') as stream:
        os.chmod(path, 0o600)
        json.dump(value, stream, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())


def git(*args):
    return subprocess.check_output(['git', *args], cwd=REPO,
        env={**os.environ, 'DEVELOPER_DIR': '/Library/Developer/CommandLineTools'})


def invariant_files():
    for path, expected in PROTECTED.items():
        assert not path.is_symlink() and sha(path) == expected, 'Protected artifact changed'


def source_entries():
    names = git('ls-tree', '-r', '--name-only', REVISION).decode().splitlines()
    names = [name for name in names if not name.startswith('docs/') and
        (not Path(name).name.startswith('.env') or Path(name).name == '.env.example')]
    archive = git('archive', '--format=tar', REVISION, '--', *names)
    with tarfile.open(fileobj=io.BytesIO(archive)) as stream:
        members = {item.name: item for item in stream.getmembers() if item.isfile()}
        entries = [{'path': name, 'sha256': hashlib.sha256(stream.extractfile(members[name]).read()).hexdigest()} for name in names]
    assert len(entries) == 517
    assert hashlib.sha256(json.dumps(entries, separators=(',', ':')).encode()).hexdigest() == SOURCE_SHA
    return entries, archive


def worktree_guard():
    changes = git('diff', '--name-only', REVISION, 'HEAD').decode().splitlines()
    assert all(name.startswith('docs/') for name in changes), 'Current product differs from frozen source'
    pending = git('status', '--porcelain=v1', '-z', '--untracked-files=all').decode().split('\0')
    while pending:
        entry = pending.pop(0)
        if not entry:
            continue
        assert entry[3:].startswith('docs/'), 'Product change or untracked product file'
        if entry[0] in 'RC' or entry[1] in 'RC':
            assert pending.pop(0).startswith('docs/')
    return git('rev-parse', 'HEAD').decode().strip()


def metadata(directory):
    directory = Path(directory)
    assert re.fullmatch(r'/tmp/zarix-runtime-20261015/cnf11-extension-[0-9a-f-]{36}', str(directory))
    assert not directory.is_symlink() and directory.stat().st_mode & 0o777 == 0o700
    target = json.loads((directory / 'targets.metadata.json').read_text())
    assert target['purpose'] == 'zarix-cnf11-extension' and target['newDatabaseName'] == DATABASE
    assert target['sourceRevision'] == target['executionRevision'] == REVISION
    return directory, target


def check_copy(target):
    proof = json.loads(Path(target['sourceProofFile']).read_text())
    assert proof['revision'] == REVISION and proof['sourceManifestSha256'] == SOURCE_SHA
    assert proof['sourceCopyRoot'] == target['sourceCopyRoot']
    entries, _ = source_entries()
    assert proof['sources'] == entries
    assert all(sha(Path(target['sourceCopyRoot']) / item['path']) == item['sha256'] for item in entries)
    return proof


def guard_module():
    path = BASE.parent / 'environment/preserve-six-native-stacks-final.py'
    assert sha(path) == 'bab8ac98200fde1eea5bbce532ef28e97348e7976c02adf434bef0d42db48688'
    spec = importlib.util.spec_from_file_location('cnf11_extension_owned_guards', path)
    guard = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(guard)
    return guard


def read_env(path):
    path = Path(path)
    assert not path.is_symlink() and path.stat().st_mode & 0o077 == 0
    return dict((key, json.loads(value)) for key, value in
        (line.split('=', 1) for line in path.read_text().splitlines() if line and not line.startswith('#')))
