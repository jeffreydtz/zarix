import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

type Channel = 'manual' | 'cron' | 'payment';
type Operation = 'transaction.create' | 'cron.run' | 'payment.webhook';
type Component = 'request' | 'service' | 'database' | 'provider' | 'outbox';
type Action = 'execute' | 'persist' | 'lookup' | 'deliver' | 'acknowledge' | 'claim' | 'release' | 'replay' | 'dispatch';
type Outcome = 'started' | 'success' | 'rejected' | 'error';
export type FailureClass = 'provider' | 'consistency' | 'internal' | 'authentication' | 'validation';
type ReferenceType = 'transaction' | 'outbox' | 'user' | 'rule';

interface Context {
  correlationId: string;
  channel: Channel;
  operation: Operation;
  job?: string;
  failureClass?: FailureClass;
}

interface Observation {
  component: Component;
  action: Action;
  outcome: Outcome;
  failureClass?: FailureClass;
  referenceType?: ReferenceType;
  referenceId?: unknown;
  transactionId?: unknown;
  status?: number;
}

const context = new AsyncLocalStorage<Context>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const correlation = /^(?:corr-[a-z0-9][a-z0-9._:-]{0,74}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Only fixed fields and UUID row references reach logs. Never accept payloads,
 * exceptions, headers, credentials or financial descriptions as log metadata. */
export function observe(event: Observation): void {
  const current = context.getStore();
  if (!current) return;
  if (event.failureClass && event.outcome === 'error') current.failureClass ??= event.failureClass;
  const referenceId = typeof event.referenceId === 'string' && uuid.test(event.referenceId)
    ? event.referenceId : undefined;
  const transactionId = typeof event.transactionId === 'string' && uuid.test(event.transactionId)
    ? event.transactionId : undefined;
  console.info(JSON.stringify({
    schema: 'zarix.observation.v1',
    timestamp: new Date().toISOString(),
    correlationId: current.correlationId,
    channel: current.channel,
    operation: current.operation,
    ...(current.job ? { job: current.job } : {}),
    component: event.component,
    action: event.action,
    outcome: event.outcome,
    ...(event.failureClass ? { failureClass: event.failureClass } : {}),
    ...(referenceId && event.referenceType ? { referenceType: event.referenceType, referenceId } : {}),
    ...(transactionId ? { transactionId } : {}),
    ...(Number.isInteger(event.status) && event.status! >= 100 && event.status! <= 599 ? { status: event.status } : {}),
    // Each terminal record is also a counter sample. Existing log collectors can
    // aggregate by channel/component/outcome/failureClass without personal data.
    ...(event.outcome !== 'started' ? { metric: 'zarix_operation_total', value: 1 } : {}),
  }));
}

export async function observedStep<T>(
  event: Omit<Observation, 'outcome' | 'referenceId'>,
  task: () => Promise<T>,
  reference?: (result: T) => unknown,
): Promise<T> {
  observe({ ...event, failureClass: undefined, outcome: 'started' });
  try {
    const result = await task();
    observe({ ...event, failureClass: undefined, outcome: 'success', referenceId: reference?.(result) });
    return result;
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
    const inheritedFailure = context.getStore()?.failureClass;
    const rejected = event.component !== 'provider' && !inheritedFailure && typeof status === 'number' && status >= 400 && status < 500;
    observe({ ...event, outcome: rejected ? 'rejected' : 'error',
      failureClass: rejected ? 'validation' : event.component === 'service'
        ? inheritedFailure ?? event.failureClass : event.failureClass });
    throw error;
  }
}

/** Async-local scope keeps concurrent requests apart. It does not create a new
 * collector or monitoring account; transport/retention remain deployment config. */
export function observedRequest<T extends Response>(
  request: Request, channel: Channel, operation: Operation, task: () => Promise<T>,
): Promise<T> {
  const supplied = request.headers.get('x-correlation-id');
  const correlationId = supplied && correlation.test(supplied) ? supplied : randomUUID();
  const candidateJob = new URL(request.url).pathname.replace(/^\/api\/cron\//, '');
  const job = channel === 'cron' && ['recurring', 'notification-outbox', 'subscription-grace',
    'monthly-summary', 'net-worth-snapshot', 'weekly-summary', 'budget-alerts',
    'maturity-alerts', 'update-prices'].includes(candidateJob) ? candidateJob : undefined;
  return context.run({ correlationId, channel, operation, job }, async () => {
    observe({ component: 'request', action: 'execute', outcome: 'started' });
    try {
      const response = await task();
      const failureClass = context.getStore()?.failureClass;
      const outcome = response.status >= 500 || failureClass ? 'error'
        : response.status >= 400 ? 'rejected' : 'success';
      observe({ component: 'request', action: 'execute', outcome, status: response.status,
        failureClass: failureClass ?? (response.status >= 500 ? 'internal'
          : response.status === 401 || response.status === 403 ? 'authentication'
            : response.status >= 400 ? 'validation' : undefined) });
      response.headers.set('X-Correlation-ID', correlationId);
      return response;
    } catch (error) {
      observe({ component: 'request', action: 'execute', outcome: 'error',
        failureClass: context.getStore()?.failureClass ?? 'internal' });
      throw error;
    }
  });
}
