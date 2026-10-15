#!/usr/bin/env python3
"""One local protocol check, without Auth accounts, passwords or recovery tokens."""
import datetime
from email.message import EmailMessage
import hashlib
import json
import os
from pathlib import Path
import selectors
import smtplib
import subprocess
import time
import uuid

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
PRIVATE = Path('/tmp/zarix-runtime-20261015/auth-reset-private')
REPORT = HERE / 'smtp-protocol-verification.json'
os.umask(0o077)
assert not REPORT.exists(), 'Do not replace a previous check'
PRIVATE.mkdir(mode=0o700, exist_ok=True)
assert not PRIVATE.is_symlink() and PRIVATE.stat().st_mode & 0o077 == 0
suffix = 'protocol-' + uuid.uuid4().hex
config = PRIVATE / (suffix + '.json')
output = PRIVATE / ('smtp-attempt-' + suffix)
sender = 'noreply@example.invalid'
recipients = ['zarix-smtp-probe-a@example.invalid', 'zarix-smtp-probe-b@example.invalid']
payload = {'purpose':'zarix-local-auth-reset-smtp','host':'127.0.0.1','port':60325,
           'allowedRecipients':recipients,'outputDirectory':str(output)}
with config.open('x') as f:
    os.chmod(config,0o600); json.dump(payload,f); f.flush(); os.fsync(f.fileno())
checks = []
def check(name, actual, expected):
    checks.append({'name':name,'actual':actual,'expected':expected,'status':'PASS' if actual==expected else 'FAIL'})
    assert actual==expected, name

script = HERE / 'smtp-sink.mjs'
child = None
started = time.monotonic()
report = {'status':'RUNNING','startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'scope':'Synthetic SMTP protocol only; no Auth, accounts, passwords, recovery tokens or external email.',
          'smtpSourceSha256':hashlib.sha256(script.read_bytes()).hexdigest(),
          'checkerSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'checks':checks}
try:
    with (PRIVATE / (suffix + '.stderr.private.log')).open('xb') as err:
        child = subprocess.Popen(['node',str(script),'--config',str(config)],cwd=ROOT,stdout=subprocess.PIPE,stderr=err,text=True)
        selector=selectors.DefaultSelector();selector.register(child.stdout,selectors.EVENT_READ)
        assert selector.select(timeout=10), 'Local SMTP READY timeout'
        ready=json.loads(child.stdout.readline());selector.close()
        check('Owned child reports exact local target',[ready['status'],ready['pid'],ready['host'],ready['port']],['READY',child.pid,'127.0.0.1',60325])
        with smtplib.SMTP('127.0.0.1',60325,timeout=5) as client:
            check('EHLO accepted',client.ehlo()[0],250)
            check('No TLS AUTH or forwarding endpoint advertised',any(k in client.esmtp_features for k in ['auth','starttls']),False)
            check('Synthetic sender accepted',client.mail(sender)[0],250)
            check('Foreign synthetic recipient rejected',client.rcpt('zarix-smtp-outside@example.invalid')[0],550)
            check('DATA without accepted recipient rejected',client.docmd('DATA')[0],503)
            client.rset()
            message=EmailMessage();message['From']=sender;message['To']=recipients[0];message['Subject']='Synthetic local SMTP probe';message.set_content('capture probe\n.dot-stuffing probe\n')
            check('Accepted local message receives no recipient errors',client.send_message(message),{})
        # The server sends250 only after both private files and state are synchronized.
        receipts=list(output.glob('*.receipt.private.json'))
        check('Exactly one private receipt exists after ACK',len(receipts),1)
        receipt=json.loads(receipts[0].read_text());eml=output/receipt['fileName']
        check('Receipt binds only selected recipient',receipt['recipients'],[recipients[0]])
        check('Message hash binds reconstructed MIME bytes',hashlib.sha256(eml.read_bytes()).hexdigest(),receipt['messageSha256'])
        check('SMTP dot-stuffing reconstructed correctly',b'\r\n.dot-stuffing probe\r\n' in eml.read_bytes(),True)
        check('Message and receipt permissions0600',[eml.stat().st_mode&0o777,receipts[0].stat().st_mode&0o777],[0o600,0o600])
        check('Private attempt directory0700',output.stat().st_mode&0o777,0o700)
        child.terminate();child.wait(timeout=10)
        check('Exact owned child stopped normally',child.returncode,0)
        state=json.loads((output/'state.private.json').read_text())
        check('Final durable state has one accepted message and no active connections',[state['accepted'],state['activeConnections']],[1,0])
        check('Stop timestamp recorded',isinstance(state.get('stoppedAt'),str),True)
        report['status']='PASS'
except Exception as exc:
    report.update(status='FAIL',errorType=type(exc).__name__)
finally:
    if child and child.poll() is None:
        child.terminate()
        try:child.wait(timeout=10)
        except subprocess.TimeoutExpired:report['ownedChildStopConfirmed']=False
    report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    report['actualSeconds']=time.monotonic()-started
    REPORT.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'status':report['status'],'checks':len(checks),'passed':sum(x['status']=='PASS' for x in checks),'report':str(REPORT.relative_to(ROOT))}))
raise SystemExit(0 if report['status']=='PASS' else 1)
