#!/usr/bin/env python3
"""Start the additional fixed-data MP double; no credentials or external access."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import time


def main():
    assert os.environ.get('ZARIX_DELTA_NATIVE_WINDOW') == 'parent-released-frozen-delta'
    os.umask(0o077)
    root = Path('/tmp/zarix-runtime-20261015/implementation-delta-db3cf513-b7ad-4f2b-abcd-a2a44aeed27b')
    assert not root.is_symlink() and root.stat().st_mode & 0o777 == 0o700
    assert not (root / 'mp-nominal-service.metadata.json').exists()
    meta = json.loads((root / 'targets.metadata.json').read_text())
    user_id = json.loads(Path(meta['loginFile']).read_text())['users'][0]['id']
    def save(file, value):
        with file.open('x') as stream:
            os.chmod(file, 0o600)
            json.dump(value, stream, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 61339))
    control = {'purpose': 'cnf11-fixed-local-mp-double', 'resourceId': 'zarix-delta-preapproval-nominal',
        'userId': user_id, 'nextPaymentDate': '2026-11-06T12:00:00.000Z'}
    save(root / 'mp-nominal-control.metadata.json', control)
    source = Path(__file__).with_name('mp-nominal-http.mjs').resolve()
    repo = Path('/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix')
    env = {key: value for key, value in os.environ.items() if key in ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL']}
    env.update(ZARIX_DELTA_NATIVE_WINDOW='parent-released-frozen-delta', ZARIX_DELTA_PRIVATE=str(root))
    argv = ['node', str(source)]
    child = subprocess.Popen(argv, cwd=repo, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    record = {'name': 'mp-nominal', 'pid': child.pid, 'port': 61339, 'argv': argv,
        'cwd': str(repo), 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'rawOutputDisposition': 'discarded-before-filesystem', 'realProvider': False,
        'oldProvider61329Changed': False, 'newCredentialsCreated': False}
    save(root / 'mp-nominal-attempt.metadata.json', record)
    try:
        for _ in range(80):
            assert child.poll() is None
            probe = subprocess.run(['/usr/sbin/lsof', '-nP', '-a', '-p', str(child.pid), '-iTCP:61339', '-sTCP:LISTEN', '-Fn'], capture_output=True, text=True)
            if probe.returncode == 0:
                assert [line[1:] for line in probe.stdout.splitlines() if line.startswith('n')] == ['127.0.0.1:61339']
                record['status'] = 'READY_PROVIDER_DOUBLE_ONLY'
                save(root / 'mp-nominal-service.metadata.json', record)
                print(json.dumps(record))
                return
            time.sleep(.25)
        raise AssertionError('New MP double did not become ready')
    except BaseException:
        if child.poll() is None:
            child.terminate()
            child.wait(timeout=10)
        raise


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'status': 'BLOCKED', 'errorType': type(error).__name__, 'rawDiagnosticsPublished': False}))
        raise SystemExit(1)
