// Prepared source only. Importing defines the contract and opens no connection.
// The released runner supplies a verified isolated Auth/SMTP context and secrets.
import assert from 'node:assert/strict';

export async function validPasswordRecovery(c) {
  assert.equal(c.releasedByRoot, true);
  assert.equal(c.nativeAuthAndSmtpReady, true);
  assert.equal(c.authIsPrivateClone, true);
  assert.ok(c.originalPassword && c.temporaryPassword && c.originalPassword !== c.temporaryPassword);
  const ownTokens = new Set();
  const secrets = [c.originalPassword, c.temporaryPassword];
  let passwordUpdateDispatched = false;
  let failure;
  const report = { case_id: 'CP2-10', status: 'RUNNING', complete_original_contract: false, assertions: [], scope: 'Original API Auth contract using one existing cloned identity and a real local SMTP exchange with a declared Node transport double. No browser, external email delivery, new identity or original Auth mutation.' };
  const check = (name, condition) => {
    const assertion = { name, status: condition ? 'PASS' : 'FAIL' };
    report.assertions.push(assertion);
    assert.equal(condition, true, name);
  };
  const safe = response => ({ httpStatus: response.status, errorCode: typeof response.body?.error_code === 'string' && /^[a-z_]{1,80}$/.test(response.body.error_code) ? response.body.error_code : null });
  const login = password => c.http('POST', '/auth/v1/token?grant_type=password', { email: c.email, password });
  const ownSession = response => {
    check('Successful ordinary Auth response belongs to the same existing identity', response.body?.user?.id === c.ownerId);
    assert.ok(response.body.access_token && response.body.refresh_token);
    ownTokens.add(response.body.access_token);
    secrets.push(response.body.access_token, response.body.refresh_token);
    return response.body.access_token;
  };
  try {
    const original = await login(c.originalPassword);
    check('Original password accepts before the one reset request', original.status === 200);
    ownSession(original);
    let message;
    if (c.retainedRecovery) {
      report.request = { httpStatus: 200, errorCode: null, retainedOriginalRequest: true };
      report.resume = c.retainedRecovery;
      check('The same retained real recovery request200 and private SMTP input are verified before continuation', c.retainedRecovery.priorRequestHttp === 200 && c.retainedRecovery.noPriorPasswordUpdate === true);
      message = await c.receiveRetainedRecoveryToken();
      check('Continuation dispatches no second recovery request or new SMTP message', message.retainedOriginalMessage === true);
    } else {
      const mailCursor = await c.mailCursor();
      await c.checkpoint({ stage: 'before-recover', passwordUpdateDispatched: false });
      const requested = await c.http('POST', '/auth/v1/recover', { email: c.email });
      report.request = safe(requested);
      check('Normal anonymous-key recovery request succeeds through real GoTrue', requested.status === 200);
      message = await c.receiveRecoveryToken({ afterSequence: mailCursor, recipient: c.email });
      assert.ok(message.sequence > mailCursor);
    }
    assert.ok(message.tokenHash);
    assert.match(message.receiptSha256, /^[a-f0-9]{64}$/);
    secrets.push(message.tokenHash);
    report.smtp = { sequence: message.sequence, receiptSha256: message.receiptSha256, acceptedByLocalSmtp: true, realExternalDelivery: false };
    check('The exact new recovery token came from the requested local SMTP message', message.requestedRecipientMatched === true && message.recoveryTypeMatched === true && message.verificationOriginMatched === true);
    const verified = await c.http('POST', '/auth/v1/verify', { token_hash: message.tokenHash, type: 'recovery' });
    report.verification = safe(verified);
    check('Delivered valid recovery token yields a real authenticated session', verified.status === 200);
    const recoveryToken = ownSession(verified);
    passwordUpdateDispatched = true;
    await c.checkpoint({ stage: 'before-password-update', passwordUpdateDispatched: true });
    const updated = await c.http('PUT', '/auth/v1/user', { password: c.temporaryPassword }, recoveryToken);
    report.passwordUpdate = safe(updated);
    check('Recovery session replaces the password for the same identity', updated.status === 200 && updated.body?.id === c.ownerId);
    const old = await login(c.originalPassword);
    report.oldPassword = safe(old);
    check('Old password is denied after recovery', old.status === 400 && old.body?.error_code === 'invalid_credentials' && !old.body?.access_token);
    const fresh = await login(c.temporaryPassword);
    report.newPassword = safe(fresh);
    check('New password accepts after recovery', fresh.status === 200);
    ownSession(fresh);
    const consumed = await c.http('POST', '/auth/v1/verify', { token_hash: message.tokenHash, type: 'recovery' });
    report.reusedToken = safe(consumed);
    check('The same delivered recovery token is consumed and cannot create another session', consumed.status === 403 && consumed.body?.error_code === 'otp_expired' && !consumed.body?.access_token);
  } catch (error) {
    failure = { type: error.name, location: String(error.stack).match(/contract\.mjs:\d+:\d+/)?.[0] || 'private-context', rawMessagePublished: false };
  } finally {
    // Restoration is attempted after any uncertain password-update dispatch too.
    // This targets only the isolated clone. Administrative recovery is cleanup,
    // never evidence that the ordinary reset/change operation succeeded.
    try {
      if (passwordUpdateDispatched) {
        await c.restoreOriginalPassword({ ownerId: c.ownerId, originalPassword: c.originalPassword, knownOwnTokens: [...ownTokens] });
        const originalAgain = await login(c.originalPassword);
        report.restoredOriginal = safe(originalAgain);
        check('Original password is restored and accepts on the isolated clone', originalAgain.status === 200);
        ownSession(originalAgain);
        const temporaryAgain = await login(c.temporaryPassword);
        report.restoredTemporaryDenied = safe(temporaryAgain);
        check('Temporary replacement password is denied after restoration', temporaryAgain.status === 400 && temporaryAgain.body?.error_code === 'invalid_credentials' && !temporaryAgain.body?.access_token);
      }
      await c.checkpoint({ stage: passwordUpdateDispatched ? 'original-password-restored' : 'no-password-update-dispatched', passwordUpdateDispatched });
    } catch (error) {
      report.restorationFailure = { type: error.name, rawMessagePublished: false };
      failure ||= { type: error.name, location: 'password-restoration', rawMessagePublished: false };
    }
    report.localSessionClosures = [];
    for (const accessToken of ownTokens) {
      try {
        const closed = await c.http('POST', '/auth/v1/logout?scope=local', undefined, accessToken);
        report.localSessionClosures.push({ httpStatus: closed.status, ownSessionOnly: true });
      } catch { report.localSessionClosures.push({ transportOutcome: 'unconfirmed', ownSessionOnly: true }); }
    }
    try {
      report.ownSessionClosure = await c.confirmOwnSessionsClosed([...ownTokens]);
      check('All newly owned Auth sessions and their refresh grants are closed', report.ownSessionClosure.allOwnSessionsClosed === true);
      const logs = await c.scanOrdinaryLogs(secrets);
      report.logSecretScan = logs;
      check('No original/replacement password or issued token appears in ordinary Auth/SMTP logs', logs.examinedFiles > 0 && logs.secretMatches === 0);
      const preserved = await c.checkProtectedRows();
      report.preservation = preserved;
      check('Original and fixture public rows remain unchanged', preserved.complete === true && preserved.unchanged === true);
    } catch (error) {
      failure ||= { type: error.name, location: 'logs-or-preservation', rawMessagePublished: false };
    }
    if (failure) { report.status = 'FAIL'; report.failure = failure; }
    else { report.status = 'PASS'; report.complete_original_contract = true; }
    report.passwordRestorationRequired = passwordUpdateDispatched;
    report.passwordRestorationConfirmed = passwordUpdateDispatched && !report.restorationFailure && report.restoredOriginal?.httpStatus === 200 && report.restoredTemporaryDenied?.httpStatus === 400;
  }
  return report;
}
