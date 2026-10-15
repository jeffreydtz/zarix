# Aislamiento de referencias offline — cierre del 15/10/2026

El caché anterior compartía snapshots, metadatos de TTL y solicitudes en curso entre todas las sesiones del navegador. La reproducción del 14/10 confirmó tres fallos: U2 recibía las categorías recientes de U1, una sesión anónima offline reutilizaba el snapshot anterior y una respuesta tardía de U1 alcanzaba la sesión de U2. [before-vitest.json](before-vitest.json) conserva esa corrida fallida y [before-manifest.json](before-manifest.json) sus hashes originales.

La corrección vincula snapshots y metadatos al ID de usuario y vincula las solicitudes en curso también a la generación de sesión. Un cambio de identidad invalida solicitudes antiguas; incluso U1→U2→U1 descarta la respuesta del primer U1. Sesiones anónimas, desconocidas o con error de consulta de Auth no adoptan referencias privadas. Los snapshots v1 sin propietario se conservan intactos y se ignoran. Volver al propietario original permite reutilizar sus propias referencias offline.

El formulario limpia referencias, selecciones y campos al cambiar de identidad, y descarta cargas que hayan sido superadas por otra carga o identidad. Warmup y formulario dejan que el caché haga la persistencia verificada: ya no reescriben respuestas antiguas por su cuenta. El evento de cambio de identidad no se emite al refrescar tokens del mismo usuario. Estas reglas sólo afectan referencias y visualización; el ID explícito de cada operación financiera conserva su protocolo anterior.

[after-vitest.json](after-vitest.json) registra 37/37 aserciones en cuatro archivos: doce de caché/identidad y veinticinco regresiones relacionadas del protocolo de intención. TypeScript y ESLint focal están registrados con salida 0 en [verification.json](verification.json), junto con comandos, fechas UTC, revisión base, Node y hashes estables de las fuentes. La revisión publicada se identifica con el commit que incluya estos archivos; la corrida también registra sus cambios locales previos al commit.

Las doce regresiones cubren TTL entre usuarios, sesión anónima offline, respuesta tardía, fallback offline propio, error de Auth, deduplicación dentro de la misma identidad, U1→U2→U1, snapshots antiguos sin propietario, respuestas vacías online/offline, cuentas, consulta Auth tardía y eventos de cambio de identidad. Son pruebas de código con dobles de Auth/HTTP/storage/lifecycle; no reemplazan recorridos en navegador, Auth real, API o RLS. No se modificó una base ni se invocó un proveedor real.

Reproducción focal desde el commit que incluya la corrección:

```sh
node node_modules/vitest/vitest.mjs run __tests__/offline-reference-cache-isolation.test.ts __tests__/financial-intent-hooks.test.ts __tests__/offline-durable-store.test.ts __tests__/investment-create-durable-store.test.ts
npm run typecheck
node node_modules/eslint/bin/eslint.js lib/offline-reference-cache.ts components/OfflineReferenceWarmup.tsx components/add-transaction/AddTransactionProvider.tsx __tests__/offline-reference-cache-isolation.test.ts
```

Las 37 aserciones forman parte de la suite global cuando ésta las ejecuta. No se suman como casos únicos adicionales a los resultados globales, ni se convierten en aprobación automática de los casos UI→API→DB.
