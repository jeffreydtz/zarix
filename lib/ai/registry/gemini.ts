import { SchemaType, type FunctionDeclaration, type Schema } from '@google/generative-ai';
import type { ZodTypeAny } from 'zod';
import {
  ZodArray,
  ZodBoolean,
  ZodDefault,
  ZodEffects,
  ZodEnum,
  ZodLazy,
  ZodLiteral,
  ZodNullable,
  ZodNumber,
  ZodObject,
  ZodOptional,
  ZodString,
  ZodUnion,
} from 'zod';
import { TOOL_CATALOG } from './catalog';

function unwrap(schema: ZodTypeAny): ZodTypeAny {
  let current: ZodTypeAny = schema;
  for (let i = 0; i < 8; i += 1) {
    if (current instanceof ZodOptional || current instanceof ZodNullable || current instanceof ZodDefault) {
      current = current._def.innerType as ZodTypeAny;
      continue;
    }
    if (current instanceof ZodEffects) {
      current = current._def.schema as ZodTypeAny;
      continue;
    }
    if (current instanceof ZodLazy) {
      current = current._def.getter() as ZodTypeAny;
      continue;
    }
    break;
  }
  return current;
}

function zodToGemini(schema: ZodTypeAny): Schema {
  const inner = unwrap(schema);
  if (inner instanceof ZodString) {
    return { type: SchemaType.STRING };
  }
  if (inner instanceof ZodNumber) {
    return { type: SchemaType.NUMBER };
  }
  if (inner instanceof ZodBoolean) {
    return { type: SchemaType.BOOLEAN };
  }
  if (inner instanceof ZodEnum) {
    const values = inner._def.values as string[];
    return { type: SchemaType.STRING, format: 'enum', enum: values };
  }
  if (inner instanceof ZodLiteral) {
    return { type: SchemaType.STRING, format: 'enum', enum: [String(inner._def.value)] };
  }
  if (inner instanceof ZodArray) {
    return { type: SchemaType.ARRAY, items: zodToGemini(inner._def.type as ZodTypeAny) };
  }
  if (inner instanceof ZodUnion) {
    const options = inner._def.options as ZodTypeAny[];
    const enums = options
      .map((opt) => unwrap(opt))
      .filter((opt): opt is ZodEnum<[string, ...string[]]> => opt instanceof ZodEnum);
    if (enums.length === options.length) {
      return { type: SchemaType.STRING, format: 'enum', enum: enums.flatMap((e) => e._def.values) };
    }
    return zodToGemini(options[0]);
  }
  if (inner instanceof ZodObject) {
    const shape = inner._def.shape() as Record<string, ZodTypeAny>;
    const properties: Record<string, Schema> = {};
    const required: string[] = [];
    for (const [key, child] of Object.entries(shape)) {
      properties[key] = zodToGemini(child);
      const naked = child;
      const isOptional =
        naked instanceof ZodOptional ||
        naked instanceof ZodDefault ||
        (naked instanceof ZodNullable && !(unwrap(naked) instanceof ZodObject));
      if (!isOptional && !(child instanceof ZodOptional) && !(child instanceof ZodDefault)) {
        required.push(key);
      }
    }
    const obj: Schema = { type: SchemaType.OBJECT, properties };
    if (required.length) (obj as { required?: string[] }).required = required;
    return obj;
  }
  return { type: SchemaType.OBJECT, properties: {} };
}

export function registryToolToGemini(name: string): FunctionDeclaration {
  const tool = TOOL_CATALOG.find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown registry tool: ${name}`);
  return {
    name: tool.name,
    description: tool.description,
    parameters: zodToGemini(tool.schema) as FunctionDeclaration['parameters'],
  };
}

export function geminiFunctionDeclarations(): FunctionDeclaration[] {
  return TOOL_CATALOG.map((tool) => registryToolToGemini(tool.name));
}
