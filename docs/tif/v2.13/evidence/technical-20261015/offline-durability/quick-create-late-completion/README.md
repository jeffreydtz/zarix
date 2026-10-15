# Respuestas tardías de creación rápida

Una categoría o cuenta creada por A podía llegar después del cambio a B y volver a agregar y seleccionar su referencia privada en el modal. El guard de las cargas GET no cubría el callback del POST. `InlineQuickCreate` ahora captura la identidad y la época del formulario antes de iniciar la solicitud, invalida su completion al cambiar de usuario, cerrar/cancelar o desmontarse, y vuelve a comprobar la época síncronamente después de las validaciones asíncronas. También rechaza una respuesta anterior después de A→B→A.

La operación de cuenta conserva el protocolo financiero existente: el guard limita las actualizaciones de UI, mientras el helper termina la solicitud y conserva el ID pendiente cuando corresponde. No cancela ni reenvía automáticamente una operación. Las respuestas válidas del mismo formulario y usuario mantienen sus callbacks normales.

La reproducción independiente final anterior al parche tuvo **3 PASS y 5 FAIL esperados**; el parche obtuvo **8/8 PASS** en ese mismo fixture. La regresión mantenida agrega el control positivo de cuenta confirmada y sign-out anónimo: **10/10 PASS**. El conjunto con componentes, helper, caché e intenciones anteriores obtuvo **42/42 PASS**, typecheck, lint de los archivos afectados y `git diff --check` con salida 0. Los resultados exactos, comandos, revisión anterior al commit, hashes y `sourceStable` están en [verification.json](./verification.json).

Los handlers y callbacks son los reales de los componentes; React/lifecycle, Auth, HTTP, referencias y helper de cuenta son dobles explícitos. La conservación del ID por el helper en el nuevo caso es simulada. El reporte separado de las 76 regresiones anteriores identifica su fixture de IndexedDB y transporte. Estos resultados no aprueban Chrome real, API/DB vivas ni CU001/CU002 completos. Los recorridos browser→API→DB del arnés de dos fases permanecen pendientes hasta que el padre confirme el build aislado y el orden de ejecución.

```sh
node node_modules/vitest/vitest.mjs run __tests__/inline-quick-create-owner-isolation.test.ts __tests__/account-create-components.test.ts __tests__/account-create-handler-outcomes.test.ts __tests__/offline-reference-cache-isolation.test.ts __tests__/financial-intent-hooks.test.ts
npm run typecheck
node node_modules/eslint/bin/eslint.js components/expenses/InlineQuickCreate.tsx __tests__/account-create-components.test.ts __tests__/inline-quick-create-owner-isolation.test.ts scripts/test-isolated-offline-durability.mjs
```
