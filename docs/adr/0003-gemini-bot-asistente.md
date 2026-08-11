# 0003 — Google Gemini para el asistente conversacional

- **Estado:** Aceptada
- **Fecha:** 2026-08-11

## Contexto

El asistente de Telegram permite registrar y consultar finanzas en lenguaje
natural, además de leer tickets por foto (OCR) y notas de voz (transcripción).
Necesita: **function-calling** maduro (para despachar acciones concretas sobre
la base), capacidad **multimodal** (texto + imagen + audio en el mismo cliente)
y un **costo bajo** compatible con un proyecto sin ingresos todavía.

## Decisión

Usar **Google Gemini** (`@google/generative-ai`) como motor del asistente:

- `lib/ai/gemini.ts` expone `GeminiClient` con `chatWithTools()` (loop de
  function-calling, hasta 8 rondas) y `chatWithImage()` (OCR de tickets y
  transcripción de audio).
- `lib/ai/bot-tools.ts` declara **14 tools** (create_transaction,
  create_transactions, create_account, delete_last_transaction,
  edit_last_transaction, get_spending, list_transactions, get_budget_status,
  get_portfolio, get_net_worth, get_accounts, get_quotes, list_recurring,
  create_recurring), ejecutadas por `executeBotTool` siempre scoped por userId.
- Modelos: `gemini-2.5-flash` (full) y `flash-lite` (tareas baratas),
  configurables por env (`GEMINI_MODEL_FULL` / `GEMINI_MODEL_LITE`).
- **BYO-key opcional:** la resolución de la API key es primero la del usuario
  (`users.gemini_api_key`) y, si no la cargó, cae a la del servidor
  (`GEMINI_API_KEY`). Si no hay ninguna, el asistente queda inerte y le pide al
  usuario configurarla.

## Consecuencias

- **Costo escalable a cero:** cada usuario puede traer su propia key, moviendo
  el costo variable del modelo fuera del server. La key del server es fallback.
- Multimodal nativo simplifica el código: un solo cliente cubre chat, OCR y voz.
- Las tools son un patrón **Command** despachado por nombre; agregar una
  capacidad = agregar una tool + su `case`, sin tocar el orquestador.
- **Trade-offs:** acoplamiento a un proveedor de LLM (mitigable, `GeminiClient`
  es una fachada estrecha); las respuestas del modelo no son deterministas, por
  eso las acciones sensibles (registrar un gasto detectado en una foto) pasan
  por **confirmación explícita** del usuario antes de escribir.
- Las anomalías/proyecciones NO usan Gemini: son heurísticas algorítmicas
  (determinismo + costo). El LLM se reserva para chat/tools, OCR, voz y
  redacción de resúmenes.
