import { describe, expect, it } from 'vitest';
import { TOOL_CATALOG, executeRegistryTool } from '@/lib/ai/registry';

const FIXTURE_A = '11111111-1111-4111-8111-111111111111';
const FIXTURE_B = '22222222-2222-4222-8222-222222222222';

describe('registry tools stay on the PAT user', () => {
  it('lists every tool and never embeds user B or the owner mailbox', () => {
    expect(TOOL_CATALOG).toHaveLength(14);
    const blob = JSON.stringify(TOOL_CATALOG);
    expect(blob).not.toContain(FIXTURE_B);
    expect(blob).not.toContain(FIXTURE_A);
    expect(blob.toLowerCase()).not.toContain('@hotmail.com');
  });

  it('rejects writes presented with only the read scope for every write tool', async () => {
    for (const tool of TOOL_CATALOG.filter((t) => !t.readOnly)) {
      const result = await executeRegistryTool(tool.name, { confirm: true, amount: 10, type: 'expense' }, {
        userId: FIXTURE_A,
        financialContext: { user: { default_currency: 'ARS' }, accounts: [], categories: [] } as never,
        allowedScopes: ['read'],
      });
      expect(result.response.success).toBe(false);
      expect(JSON.stringify(result)).not.toContain(FIXTURE_B);
    }
  });
});
