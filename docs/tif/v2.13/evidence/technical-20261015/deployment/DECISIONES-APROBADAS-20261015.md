# Decisiones aprobadas — 2026-10-15

Aprobadas por el responsable del proyecto (Jeffrey Dietz). `casos_prueba.csv` se conserva intacto; los contratos originales quedan como históricos.

| ID | Decisión |
|---|---|
| CP2-09 | Login: 400 del proveedor (GoTrue, `signInWithPassword`) y 401 en la API de ZARIX. Contrato reconciliado sin editar el CSV. |
| CP2-04 | Archivar y restaurar en lugar de borrado físico. |
| CP3-19 | Se mantiene blue.sell (RN08); no se agrega MEP. |
| CP1-32 | Presupuesto mensual; inicio/fin fuera de alcance. |
| CP1-25/26 | Se reconcilian con el outbox atómico; los literales originales quedan como históricos. |
| CP2-19 | DELETE de preferencias no soportado; restablecer vía PUT. |
| braces (GHSA-vfj7-8cjw-p6xm) | Riesgo aceptado y documentado: sin versión parcheada, afecta sólo build/lint. |
| Límites de plan | **Eliminados.** Se retira la migración `enforce_plan_allowances` (límite de cuentas, `movement_enabled`, selección de cuentas, cupos OCR/IA, recurrentes sólo Premium). Paridad con producción: usuarios `ACTIVE`/`GRACE_PERIOD` tienen acceso completo. `create_account_with_opening_balance` se conserva en `20261009034943_atomic_account_creation.sql`. Los casos de prueba de límites de plan pasan a fuera de alcance. |
| Cron outbox | `/api/cron/notification-outbox` retirado de `vercel.json`: **pausado** hasta autorización explícita de envíos reales por Telegram. Las notificaciones se encolan en `notification_outbox` pero no se envían. |
| Despliegue | Merge de PR #12 a `main` (no promoción del preview). Aplicado **sin respaldo de base**, riesgo asumido explícitamente por el responsable. Rollback de app: Instant Rollback a `dpl_AiWLPM3HGJgptKTc6Mfn5wJoHmsQ`; la base no tiene respaldo. |
