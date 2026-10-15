#!/usr/bin/env python3
"""Build-only preparation: immutable source copy and reference metadata, no SQL/network."""
import datetime
import io
import json
import os
from pathlib import Path, PurePosixPath
import sys
import tarfile
import uuid
sys.dont_write_bytecode = True
from common import BASE, CHECKPOINT, DATABASE, PRIOR, REPO, REVISION, RUNTIME, SOURCE_SHA, invariant_files, save, sha, source_entries, worktree_guard


def main():
    assert os.environ.get('ZARIX_CNF11_EXTENSION_PREPARE') == 'parent-authorized-build-only'
    os.umask(0o077)
    invariant_files()
    head = worktree_guard()
    assert head == CHECKPOINT
    previous_stop = json.loads((PRIOR / 'retention-stop.sanitized.json').read_text())
    assert previous_stop['status'] == 'RETAIN_AND_STOP_PASS'
    assert previous_stop['retention']['archiveSha256'] == '1f958b0273576ef9bd488a5ffde575f93f12f5eae3e67ce2114862a19726deaf'
    previous = json.loads((PRIOR / 'targets.metadata.json').read_text())
    assert previous['newDatabaseName'] == DATABASE
    entries, archive = source_entries()
    assert all(sha(REPO / item['path']) == item['sha256'] for item in entries)
    run = str(uuid.uuid4())
    private = RUNTIME / ('cnf11-extension-' + run)
    copy = Path('/tmp/zarix-cnf11-extension-app-' + run)
    private.mkdir(mode=0o700)
    copy.mkdir(mode=0o700)
    with tarfile.open(fileobj=io.BytesIO(archive)) as stream:
        for item in stream:
            relative = PurePosixPath(item.name)
            assert not relative.is_absolute() and '..' not in relative.parts
            path = copy / item.name
            if item.isdir():
                path.mkdir(parents=True, exist_ok=True)
            else:
                assert item.isfile()
                path.parent.mkdir(parents=True, exist_ok=True)
                with path.open('xb') as output:
                    output.write(stream.extractfile(item).read())
    assert all(sha(copy / item['path']) == item['sha256'] for item in entries)
    os.symlink(REPO / 'node_modules', copy / 'node_modules', target_is_directory=True)
    proof_file = private / 'source-proof.metadata.json'
    proof = {'revision': REVISION, 'sourceRevision': REVISION, 'checkoutRevision': head,
        'sourceCopyRoot': str(copy), 'copyRoot': str(copy), 'sourceCount': len(entries), 'sources': entries,
        'sourceManifestSha256': SOURCE_SHA, 'sourceStable': True, 'gitMatch': True,
        'copyMatchesExactGitRevisionBeforeRun': True, 'buildExecuted': False, 'nextStarted': False,
        'nodeModulesUseRootSymlink': True, 'credentialValuesCopied': False, 'controllerSha256': sha(__file__)}
    save(proof_file, proof)
    target = {**previous, 'purpose': 'zarix-cnf11-extension', 'run': run,
        'sourceRevision': REVISION, 'executionRevision': REVISION, 'revision': REVISION,
        'schemaApplicationBaseline': previous['revision'], 'sourceCopyRoot': str(copy),
        'sourceProofFile': str(proof_file), 'existingApplicationBuildProofFile': None,
        'checkoutCheckpoint': head, 'priorRuntimeDirectory': str(PRIOR),
        'lastRetentionVerificationFile': str(PRIOR / 'retention-stop.sanitized.json'),
        'lastArchiveFile': previous_stop['retention']['privateDirectory'] + '/database.dump',
        'lastArchiveSha256': previous_stop['retention']['archiveSha256'],
        'existingCronEnvironmentFile': str(RUNTIME / 'e2e-app.env'),
        'apiOrigin': 'http://127.0.0.1:61321', 'providerOrigin': 'http://127.0.0.1:61329',
        'nativeOriginalPreflightFile': str(private / 'native-original-preflight.private.json'),
        'priorNativePreflightFile': previous['nativeOriginalPreflightFile'],
        'newDatabaseCreated': False, 'newUsersCreated': 0, 'newCredentialFiles': 0,
        'servicesStarted': False, 'purposeOfThisReopen': 'cnf11-extension'}
    save(private / 'targets.metadata.json', target)
    result = {'status': 'BUILD_ONLY_SOURCE_READY_RUNTIME_NOT_STARTED', 'run': run,
        'privateDirectory': str(private), 'targetsFile': str(private / 'targets.metadata.json'),
        'sourceCopyRoot': str(copy), 'sourceRevision': REVISION, 'sourceCount': len(entries),
        'sourceManifestSha256': SOURCE_SHA, 'sourceProofFile': str(proof_file),
        'sqlExecuted': False, 'nativeStarted': False, 'newCredentialFiles': 0,
        'controllerSha256': sha(__file__), 'preparedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    save(private / 'prepare-source.sanitized.json', result)
    invariant_files()
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'status': 'BLOCKED', 'errorType': type(error).__name__, 'rawDiagnosticsPublished': False,
            'nativeStarted': False, 'sqlExecuted': False}))
        raise SystemExit(1)
