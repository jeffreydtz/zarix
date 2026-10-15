# Cifrado del volumen local — 15/10/2026

La [observación actual](at-rest.json), `2026-10-15T00:55:56.768393Z`, confirma que `/tmp/zarix-runtime-20261015` resuelve a `/private/tmp/zarix-runtime-20261015` y está en `/dev/disk3s5`, APFS **Data**, montado en `/System/Volumes/Data` dentro de `disk3`. El mapeo de `df -P` coincide con `diskutil info -plist /System/Volumes/Data`.

`fdesetup status` devolvió **FileVault is On**. Diskutil informó `FileVault=true`, `Encryption=true`, `EncryptionThisVolumeProper=true` y `Locked=false`. Se observó cifrado en reposo del volumen que aloja el runtime, datos PostgreSQL temporales, respaldo privado y fixtures locales de Auth/Storage. El volumen está montado y desbloqueado durante la tarea; esta prueba no demuestra cifrado individual del dump ni cifrado/configuración de Supabase hospedado o producción. Es evidencia parcial local para CNF-04.

El [intento inicial dentro del sandbox](at-rest-sandbox-attempt.json) se conserva por separado: pudo identificar el dispositivo con `df`, pero fdesetup no resolvió el volumen y DiskManagement no estuvo disponible para diskutil. La lectura posterior autorizada fuera del sandbox obtuvo los resultados actuales. No se modificó configuración, no se solicitó contraseña administrativa, no se abrió Keychain y no se crearon permisos persistentes. La evidencia omite seriales, UUID de hardware, cuentas, claves y plist crudo.

La observación histórica del 14/10 queda separada; no se reutilizó como verificación actual. Estos comandos son únicamente de lectura:

```sh
df -P /tmp/zarix-runtime-20261015
fdesetup status
diskutil info -plist /System/Volumes/Data
```
