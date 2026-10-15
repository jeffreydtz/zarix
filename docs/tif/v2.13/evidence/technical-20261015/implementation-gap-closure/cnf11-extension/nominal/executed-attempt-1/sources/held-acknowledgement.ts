import { performance } from 'node:perf_hooks';
import { setTimeout as keepAliveTimer, clearTimeout as clearKeepAlive } from 'node:timers';

export interface AcknowledgementAudit {
  scope: 'in-process-handler-consumer-boundary';
  stage: 'mutation-committed' | 'no-op-confirmed';
  adapterStartedAtMs?: number;
  handlerResolvedAtMs?: number;
  sqlOracleConfirmedAtMs?: number;
  timeoutStartedAtMs?: number;
  timeoutFiredAtMs?: number;
  upstreamStatus?: number;
  deadlineMs?: number;
  elapsedAfterOracleMs?: number;
  responseForwardedToConsumer: false;
  commitOracleConfirmed: boolean;
  timeoutName?: string;
  nativeDomException?: boolean;
  nativeSignalAborted?: boolean;
  rejectedWithSignalReason?: boolean;
}

/** Actual handler -> actual native SQL oracle -> response held -> native
 * AbortSignal deadline. This does not simulate a physical socket failure. */
export async function holdCommittedAcknowledgement(
  command: () => Promise<Response>,
  verifyCommittedState: (response: Response) => Promise<void> | void,
  audit: AcknowledgementAudit,
  deadlineMs = 40,
): Promise<never> {
  if (!Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 1000) throw new Error('InvalidControlledDeadline');
  audit.adapterStartedAtMs = performance.now();
  const retainedResponse = await command();
  audit.handlerResolvedAtMs = performance.now();
  audit.upstreamStatus = retainedResponse.status;
  await verifyCommittedState(retainedResponse);
  audit.sqlOracleConfirmedAtMs = performance.now();
  audit.commitOracleConfirmed = true;
  audit.deadlineMs = deadlineMs;
  audit.timeoutStartedAtMs = performance.now();
  const signal = AbortSignal.timeout(deadlineMs);
  // AbortSignal.timeout uses an unreferenced native timer. Keep this promise's
  // event loop alive without using that extra timer as the timeout source.
  const keepAlive = keepAliveTimer(() => {}, deadlineMs + 1000);
  let onAbort: (() => void) | undefined;
  try {
    return await new Promise<never>((_resolve, reject) => {
      onAbort = () => {
        const reason: unknown = signal.reason;
        audit.timeoutFiredAtMs = performance.now();
        audit.elapsedAfterOracleMs = audit.timeoutFiredAtMs - audit.sqlOracleConfirmedAtMs!;
        audit.timeoutName = reason instanceof Error ? reason.name : undefined;
        audit.nativeDomException = reason instanceof DOMException && reason.name === 'TimeoutError';
        audit.nativeSignalAborted = signal.aborted;
        audit.rejectedWithSignalReason = true;
        reject(reason);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
  } finally {
    clearKeepAlive(keepAlive);
    if (onAbort) signal.removeEventListener('abort', onAbort);
    // retainedResponse was never resolved to the consumer or parsed here.
    void retainedResponse;
  }
}
