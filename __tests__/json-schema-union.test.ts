import { describe, expect, it } from 'vitest';
import { fromJsonSchema } from '@modelcontextprotocol/server';
import { TOOL_SCHEMAS } from '@/lib/ai/registry/schemas';
import { advertisedToolJsonSchema, zodToJsonSchema } from '@/lib/ai/registry/json-schema';
import { buildOpenApiDocument } from '@/lib/api/v1/openapi';

const PENDING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9';

describe('create_transaction JSON Schema accepts a write or a frozen confirm', () => {
  it('emits anyOf for OpenAPI and MCP advertised schemas', () => {
    const json = zodToJsonSchema(TOOL_SCHEMAS.create_transaction);
    expect(json.anyOf).toHaveLength(2);
    const advertised = advertisedToolJsonSchema(TOOL_SCHEMAS.create_transaction);
    expect(advertised.type).toBe('object');
    expect(advertised.anyOf).toHaveLength(2);
    const serialized = JSON.stringify(advertised);
    expect(serialized).toContain('"confirm"');
    expect(serialized).toContain('"pendingId"');
    expect(serialized).toContain('"pendingIds"');
    expect(serialized).toContain('"type"');
    expect(serialized).toContain('"amount"');

    const openapi = buildOpenApiDocument('https://example.invalid');
    const schema = (
      openapi.paths['/api/v1/tools/create_transaction'] as {
        post: { requestBody: { content: { 'application/json': { schema: { anyOf?: unknown[] } } } } };
      }
    ).post.requestBody.content['application/json'].schema;
    expect(schema.anyOf).toHaveLength(2);
  });

  it('lets MCP validate confirm-only payloads that omit type and amount', () => {
    const schema = fromJsonSchema(
      advertisedToolJsonSchema(TOOL_SCHEMAS.create_transaction) as { type: 'object' }
    );
    const confirm = schema['~standard'].validate({ confirm: true, pendingId: PENDING_ID });
    expect('value' in confirm).toBe(true);
    const batch = schema['~standard'].validate({ confirm: true, pendingIds: [PENDING_ID] });
    expect('value' in batch).toBe(true);
    const write = schema['~standard'].validate({ type: 'expense', amount: 1250, currency: 'ARS' });
    expect('value' in write).toBe(true);
  });
});
