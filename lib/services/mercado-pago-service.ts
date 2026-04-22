import type { SubscriptionStatus } from '@/types/database';

const DEFAULT_MP_API_BASE = 'https://api.mercadopago.com';
const DEFAULT_GRACE_DAYS = 7;

type MercadoPagoFrequencyType = 'days' | 'months';

export interface CreatePreapprovalInput {
  userId: string;
  payerEmail: string;
  reason: string;
  backUrl: string;
  transactionAmount: number;
  currencyId: string;
  frequency?: number;
  frequencyType?: MercadoPagoFrequencyType;
}

export interface MercadoPagoPreapproval {
  id: string;
  status: string;
  external_reference: string | null;
  init_point?: string;
  auto_recurring?: {
    frequency?: number;
    frequency_type?: MercadoPagoFrequencyType;
    transaction_amount?: number;
    currency_id?: string;
    next_payment_date?: string | null;
  };
}

export interface SubscriptionTransition {
  status: SubscriptionStatus;
  currentPeriodEnd?: string | null;
  gracePeriodEnd?: string | null;
}

class MercadoPagoService {
  private get accessToken(): string {
    const token = process.env.MP_ACCESS_TOKEN;
    if (!token) {
      throw new Error('MP_ACCESS_TOKEN is not configured');
    }
    return token;
  }

  private get apiBaseUrl(): string {
    return process.env.MP_API_BASE_URL || DEFAULT_MP_API_BASE;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const raw = await response.text().catch(() => '');
      throw new Error(`MercadoPago API ${response.status}: ${raw || response.statusText}`);
    }

    return (await response.json()) as T;
  }

  async createPreapproval(input: CreatePreapprovalInput): Promise<MercadoPagoPreapproval> {
    const payload = {
      reason: input.reason,
      external_reference: input.userId,
      payer_email: input.payerEmail,
      back_url: input.backUrl,
      auto_recurring: {
        frequency: input.frequency ?? 1,
        frequency_type: input.frequencyType ?? 'months',
        transaction_amount: input.transactionAmount,
        currency_id: input.currencyId,
      },
      status: 'pending',
    };

    return this.request<MercadoPagoPreapproval>('/preapproval', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getPreapproval(preapprovalId: string): Promise<MercadoPagoPreapproval> {
    return this.request<MercadoPagoPreapproval>(
      `/preapproval/${encodeURIComponent(preapprovalId)}`
    );
  }

  extractPreapprovalId(
    payload: unknown,
    queryParams?: URLSearchParams
  ): string | null {
    const maybe = payload as
      | {
          id?: string;
          resource?: string;
          data?: { id?: string };
        }
      | null
      | undefined;

    const dataId = maybe?.data?.id;
    if (typeof dataId === 'string' && dataId.trim()) {
      return dataId;
    }

    if (typeof maybe?.id === 'string' && maybe.id.trim()) {
      return maybe.id;
    }

    if (typeof maybe?.resource === 'string') {
      const match = maybe.resource.match(/\/preapproval\/([^/?#]+)/i);
      if (match?.[1]) {
        return decodeURIComponent(match[1]);
      }
    }

    const queryCandidates = [
      queryParams?.get('id'),
      queryParams?.get('data.id'),
      queryParams?.get('preapproval_id'),
    ];

    for (const candidate of queryCandidates) {
      if (candidate && candidate.trim()) {
        return candidate;
      }
    }

    return null;
  }

  mapPreapprovalStatusToSubscription(
    preapproval: MercadoPagoPreapproval,
    currentStatus: SubscriptionStatus,
    now: Date = new Date()
  ): SubscriptionTransition {
    const mpStatus = preapproval.status.toLowerCase();
    const nextPaymentDate = preapproval.auto_recurring?.next_payment_date || null;

    if (mpStatus === 'authorized' || mpStatus === 'active') {
      return {
        status: 'ACTIVE',
        currentPeriodEnd: nextPaymentDate,
        gracePeriodEnd: null,
      };
    }

    if (mpStatus === 'rejected') {
      if (currentStatus === 'ACTIVE') {
        const graceEnd = new Date(now);
        graceEnd.setDate(graceEnd.getDate() + DEFAULT_GRACE_DAYS);
        return {
          status: 'GRACE_PERIOD',
          currentPeriodEnd: nextPaymentDate,
          gracePeriodEnd: graceEnd.toISOString(),
        };
      }
      if (currentStatus === 'GRACE_PERIOD') {
        return {
          status: 'GRACE_PERIOD',
          currentPeriodEnd: nextPaymentDate,
        };
      }
      return {
        status: 'PAST_DUE',
        currentPeriodEnd: nextPaymentDate,
      };
    }

    if (mpStatus === 'paused' || mpStatus === 'cancelled' || mpStatus === 'canceled') {
      return {
        status: 'CANCELED',
        currentPeriodEnd: nextPaymentDate,
        gracePeriodEnd: null,
      };
    }

    if (mpStatus === 'pending') {
      return {
        status: 'PAST_DUE',
        currentPeriodEnd: nextPaymentDate,
        gracePeriodEnd: null,
      };
    }

    return {
      status: currentStatus,
      currentPeriodEnd: nextPaymentDate,
    };
  }
}

export const mercadoPagoService = new MercadoPagoService();
