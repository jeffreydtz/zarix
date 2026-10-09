import { afterEach, describe, expect, it, vi } from 'vitest';
import { shouldExecuteToday } from '@/lib/cron/recurring-schedule';
// Exact calendar fixtures from docs/tif/v2.13/casos_prueba.csv. No provider or UI claims.
const cases = [
  {
    "id": "CB-R01",
    "rule": {
      "frequency": "daily"
    },
    "clock": "2026-10-06T15:00:00Z",
    "expected": false
  },
  {
    "id": "CB-R02",
    "rule": {
      "frequency": "daily",
      "start_date": "2026-02-30"
    },
    "clock": "2026-03-01T15:00:00Z",
    "expected": false
  },
  {
    "id": "CB-R03",
    "rule": {
      "frequency": "daily",
      "start_date": "2026-10-07"
    },
    "clock": "2026-10-06T15:00:00Z",
    "expected": false
  },
  {
    "id": "CB-R04",
    "rule": {
      "frequency": "daily",
      "start_date": "2026-10-06"
    },
    "clock": "2026-10-06T15:00:00Z",
    "expected": true
  },
  {
    "id": "CB-R05",
    "rule": {
      "frequency": "daily",
      "start_date": "2026-10-01",
      "end_date": "2026-10-05"
    },
    "clock": "2026-10-06T15:00:00Z",
    "expected": false
  },
  {
    "id": "CB-R06",
    "rule": {
      "frequency": "daily",
      "start_date": "2026-10-01",
      "end_date": "2026-10-06"
    },
    "clock": "2026-10-06T15:00:00Z",
    "expected": true
  },
  {
    "id": "CB-R07",
    "rule": {
      "frequency": "daily",
      "start_date": "2026-10-01",
      "end_date": null
    },
    "clock": "2026-10-06T15:00:00Z",
    "expected": true
  },
  {
    "id": "CB-R08",
    "rule": {
      "frequency": "daily",
      "start_date": "2026-10-06",
      "end_date": "2026-10-05"
    },
    "clock": "2026-10-06T15:00:00Z",
    "expected": false
  },
  {
    "id": "CB-R09",
    "rule": {
      "frequency": "daily",
      "start_date": "2026-10-01",
      "last_executed_date": "2026-10-06"
    },
    "clock": "2026-10-06T15:00:00Z",
    "expected": false
  },
  {
    "id": "CB-R10",
    "rule": {
      "frequency": "weekly",
      "start_date": "2026-09-29"
    },
    "clock": "2026-10-06T15:00:00Z",
    "expected": true
  },
  {
    "id": "CB-R11",
    "rule": {
      "frequency": "weekly",
      "start_date": "2026-09-30"
    },
    "clock": "2026-10-06T15:00:00Z",
    "expected": false
  },
  {
    "id": "CB-R12",
    "rule": {
      "frequency": "monthly",
      "start_date": "2026-08-31"
    },
    "clock": "2026-09-30T15:00:00Z",
    "expected": true
  },
  {
    "id": "CB-R13",
    "rule": {
      "frequency": "monthly",
      "start_date": "2026-08-29"
    },
    "clock": "2026-09-30T15:00:00Z",
    "expected": false
  },
  {
    "id": "CB-R14",
    "rule": {
      "frequency": "monthly",
      "start_date": "2025-01-31"
    },
    "clock": "2025-02-28T15:00:00Z",
    "expected": true
  },
  {
    "id": "CB-R15",
    "rule": {
      "frequency": "monthly",
      "start_date": "2024-01-31"
    },
    "clock": "2024-02-29T15:00:00Z",
    "expected": true
  },
  {
    "id": "CB-R16",
    "rule": {
      "frequency": "yearly",
      "start_date": "2025-10-06"
    },
    "clock": "2026-10-06T15:00:00Z",
    "expected": true
  },
  {
    "id": "CB-R17",
    "rule": {
      "frequency": "yearly",
      "start_date": "2025-09-06"
    },
    "clock": "2026-10-06T15:00:00Z",
    "expected": false
  },
  {
    "id": "CB-R18",
    "rule": {
      "frequency": "yearly",
      "start_date": "2025-10-05"
    },
    "clock": "2026-10-06T15:00:00Z",
    "expected": false
  },
  {
    "id": "CB-R19",
    "rule": {
      "frequency": "yearly",
      "start_date": "2024-02-29"
    },
    "clock": "2025-02-28T15:00:00Z",
    "expected": true
  },
  {
    "id": "CB-R20",
    "rule": {
      "frequency": "fortnightly",
      "start_date": "2026-10-01"
    },
    "clock": "2026-10-06T15:00:00Z",
    "expected": false
  },
  {
    "id": "CB-R21",
    "rule": {
      "frequency": "daily",
      "start_date": "2026-10-06"
    },
    "clock": "2026-10-06T02:59:59Z",
    "expected": false
  },
  {
    "id": "CB-R22",
    "rule": {
      "frequency": "daily",
      "start_date": "2026-10-06"
    },
    "clock": "2026-10-06T03:00:00Z",
    "expected": true
  },
  {
    "id": "CB-R23",
    "rule": {
      "frequency": "daily",
      "start_date": "2026-10-01",
      "last_executed_date": "2026-10-07"
    },
    "clock": "2026-10-06T15:00:00Z",
    "expected": false
  }
];
describe('v2.13 explicit case contracts', () => {
 afterEach(() => vi.useRealTimers());
 it.each(cases)('$id calendar contract', ({rule,clock,expected}) => {
  vi.useFakeTimers();vi.setSystemTime(new Date(clock));expect(shouldExecuteToday(rule)).toBe(expected);
 });
});
