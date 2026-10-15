# Retoma autorizada y runtime nuevo

El checkout y el remoto coincidían en `d4524d8a79fabd5e44112345897a6350dc4d0805`. No había archivos staged; se preservaron los cambios tracked y 78 archivos untracked en `/tmp/zarix-checkpoint-20261015` antes de consolidarlos. No se reseteó el checkout ni se sustituyó trabajo ajeno.

El runtime del 13–14/10 no existe en `/tmp` ni `/private/tmp`, verificado también fuera del sandbox. Los dumps, credenciales y fixtures temporales anteriores no se presentan como disponibles para continuar. Su evidencia versionada sigue preservada con sus fases/revisiones originales. Se crearon cuatro instancias nuevas y vacías en `/tmp/zarix-runtime-20261015`, sin reset ni destroy de datos previos: [manifiesto](runtime-manifest.json) y [preparación reproducible](runtime-preparation.md).

SOURCE/RESTORE usan API54321/55321; LOAD56321 y E2E57321 son réplicas separadas para fixtures propios. La disponibilidad del runtime y sus baselines vacíos no acredita la ejecución funcional posterior.

La inhibición temporal se inspeccionó antes y después. Al verificar el inicio propio apareció otra inhibición `caffeinate -i -w 56086`, PID56089, ligada a un proceso local. Se cerró únicamente el supervisor propio56163 y su hijo56165 para evitar duplicarla; ambos dejaron de aparecer en la comprobación posterior y PID56089 conservó `PreventUserIdleSystemSleep`. No se cambió ninguna preferencia permanente ni se desactivó el bloqueo de pantalla. El proceso existente pertenece a otra sesión; este trabajo no lo termina ni garantiza que sobreviva a esa sesión. La verificación de conexión sigue siendo independiente.

En el repositorio sólo apareció `.env.example`. Las variables `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` estaban ausentes en el proceso autorizado. No se buscaron credenciales en cuentas ajenas ni se usó Matilda PDV. Cron y proveedores con fallas inyectadas usan exclusivamente valores sintéticos locales, privados; no representan entrega real a Telegram, OCR/Gemini ni un sandbox real de Mercado Pago.

El índice oficial de Supabase fue consultado de nuevo. Los cambios de PostgreSQL17.11 relativos a ltree/pgcrypto legacy/btree_gist/custom operators se distinguen de una instalación nueva en17.11; no se hizo reindex ni se modificó un proyecto remoto. La deprecación de cifrados TLS en APIs alojadas tampoco certifica TLS del loopback HTTP. [Changelog PostgreSQL](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes) · [Changelog TLS](https://supabase.com/changelog/cbc-tls-ciphers-deprecated).

Las [lecturas públicas del 15/10](../public-quote-providers.json) devolvieron HTTP200/JSON para CriptoYa, DolarApi, CoinGecko y Yahoo. Son observaciones GET sin credenciales; no prueban la frescura/utilidad financiera del contenido, fallback de la aplicación, UI→API→DB ni disponibilidad mensual.
