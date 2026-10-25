import type { z } from 'zod';

type JsonSchema = Record<string, unknown>;

function unwrap(schema: z.ZodTypeAny): { inner: z.ZodTypeAny; optional: boolean; nullable: boolean } {
  let inner = schema;
  let optional = false;
  let nullable = false;
  for (let i = 0; i < 6; i += 1) {
    const type = inner._def?.typeName as string | undefined;
    if (type === 'ZodOptional' || type === 'ZodDefault') {
      optional = true;
      inner = inner._def.innerType;
      continue;
    }
    if (type === 'ZodNullable') {
      nullable = true;
      inner = inner._def.innerType;
      continue;
    }
    if (type === 'ZodEffects') {
      inner = inner._def.schema;
      continue;
    }
    break;
  }
  return { inner, optional, nullable };
}

function describe(schema: z.ZodTypeAny): JsonSchema {
  const { inner, nullable } = unwrap(schema);
  const type = inner._def?.typeName as string | undefined;
  let node: JsonSchema;
  switch (type) {
    case 'ZodString':
      node = { type: 'string' };
      break;
    case 'ZodNumber':
      node = { type: 'number' };
      break;
    case 'ZodBoolean':
      node = { type: 'boolean' };
      break;
    case 'ZodEnum':
      node = { type: 'string', enum: inner._def.values };
      break;
    case 'ZodArray':
      node = { type: 'array', items: describe(inner._def.type) };
      break;
    case 'ZodObject':
      node = objectSchema(inner);
      break;
    case 'ZodLiteral': {
      const value = inner._def.value as string | number | boolean;
      const literalType =
        typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string';
      node = { type: literalType, const: value, enum: [value] };
      break;
    }
    case 'ZodUnion':
      node = {
        anyOf: (inner._def.options as z.ZodTypeAny[]).map((option) => describe(option)),
      };
      break;
    default:
      node = {};
  }
  if (nullable) {
    return { anyOf: [node, { type: 'null' }] };
  }
  return node;
}

function objectSchema(schema: z.ZodTypeAny): JsonSchema {
  const shape = schema._def.shape();
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const [key, value] of Object.entries(shape as Record<string, z.ZodTypeAny>)) {
    const { optional } = unwrap(value);
    properties[key] = describe(value);
    if (!optional) required.push(key);
  }
  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: false,
  };
}

export function zodToJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  return describe(schema);
}

/** MCP requires type:object at the root; keep union writes as anyOf. */
export function advertisedToolJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  const json = zodToJsonSchema(schema);
  if (Array.isArray(json.anyOf) && json.type !== 'object') {
    return { type: 'object', anyOf: json.anyOf };
  }
  return json;
}
