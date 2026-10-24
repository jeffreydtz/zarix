import { TOOL_CATALOG, TOOL_SCHEMAS } from '@/lib/ai/registry';
import { zodToJsonSchema } from '@/lib/ai/registry/json-schema';

export function buildOpenApiDocument(origin = 'https://zarix-phi.vercel.app') {
  const paths: Record<string, unknown> = {
    '/api/v1/tools': {
      get: {
        operationId: 'listTools',
        summary: 'Lista las herramientas visibles para el token',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Catálogo filtrado por scopes del PAT' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
  };

  for (const tool of TOOL_CATALOG) {
    paths[`/api/v1/tools/${tool.name}`] = {
      post: {
        operationId: tool.name,
        summary: tool.description,
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: zodToJsonSchema(TOOL_SCHEMAS[tool.name as keyof typeof TOOL_SCHEMAS]),
            },
          },
        },
        responses: {
          '200': { description: 'Resultado de la herramienta' },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Scope insuficiente' },
        },
      },
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Zarix API v1',
      version: '0.1.0',
      description: 'API generada desde el registro de herramientas. Autenticación: PAT Bearer zrxp_…',
    },
    servers: [{ url: origin }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'zrxp' },
      },
    },
  };
}
