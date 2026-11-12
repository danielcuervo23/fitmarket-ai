# Puesta en marcha del plan 2 (reglas, optimizador y recetas)

Lista de pasos en orden. Regla: antes de cada paso en produccion, el desarrollador pregunta "¿lo hago?" y el dueno responde OK. Nada se hace en produccion sin ese OK.

Quien: **Dueno** = tu. **Desarrollador** = el equipo/agentes.

> Este documento lo empezo la tarea 8 (la calculadora de compras). La tarea 18 lo completa con el resto de pasos (migracion 015, revision de recetas, produccion en orden y seguimiento).

## Como se despliega `generate-weekly-plan` (staging y produccion, siempre igual)

**Que es:** el plan usa una calculadora matematica llamada HiGHS para encontrar la compra mas barata que cumple tus metas. Viene en un archivo aparte (`highs.wasm`, unos 3,5 MB), como un motor que se instala dentro del carro. Ese motor no se guarda en git: se copia justo antes de cada despliegue. Si se olvida la copia, la funcion sale sin motor.

- **Desarrollador**, con Docker encendido y desde la carpeta del proyecto:

  ```bash
  npm ci && npm run functions:wasm
  supabase functions deploy generate-weekly-plan
  ```

  (o `npm ci && npm run deploy:plan-fn`, que hace la copia y el despliegue seguidos).
- **Nunca** usar `--use-api` con esta funcion: ese modo no sube archivos estaticos y la funcion quedaria sin motor.
- `npm run functions:wasm` falla con un mensaje claro si falta el archivo (por ejemplo, si no se corrio `npm ci`). Si falla, no se despliega.
- **Comprobar el archivo copiado** (que sea exactamente el de highs 1.15.4): su huella sha256 debe ser

  `f13134e3e335e7bad984ff12abeb41e86e0eeeb1752ae8a85322cc6839df8acd`

  Se mira con `sha256sum supabase/functions/generate-weekly-plan/highs.wasm` (en Windows: `certutil -hashfile supabase\functions\generate-weekly-plan\highs.wasm SHA256`). Si la huella no coincide, no se despliega.
- La funcion lleva su `deno.json` (`"highs": "npm:highs@1.15.4"`), y `supabase/config.toml` lista `highs.wasm` en `static_files` con `verify_jwt = true`.

## Paso obligatorio antes de produccion: prueba de humo de la calculadora (staging)

Antes de salir a la calle (produccion) hay que encender el carro en el taller (staging) y ver que arranca y que no gasta mas de la cuenta.

- **Desarrollador:**
  1. Despliega `generate-weekly-plan` en **staging** como dice la seccion anterior (copia, huella, despliegue con Docker).
  2. Prueba de humo: una llamada que cargue la calculadora (`prepareLp()`) y resuelva un problema pequeno (`solveLp`, por ejemplo el de la dieta de `lp.test.mjs`, cuyo resultado es 0.08). Si la funcion todavia no llama a la calculadora (eso llega con la tarea 13), se usa una funcion de prueba temporal solo en staging y se borra al terminar.
- **Comprobar:**
  - `prepareLp()` responde `true` (el motor cargo) y el resultado es factible con costo 0.08. Si responde `false`, el codigo de `lpLoadError()` dice por que: `wasm_not_found` (el archivo no viajo), `wasm_instantiate_failed` (el archivo esta danado o es de otra version) o `load_timeout` (tardo mas de 5 s).
  - En los registros de Supabase, el **tiempo de CPU** de esa llamada (carga + una solucion) es **menor a 900 ms**. En pruebas locales la carga gasta unos 50 ms y cada solucion entre 10 y 100 ms.
  - Una segunda llamada a la misma instancia no vuelve a cargar el motor.
- **Si falla:** no se pasa a produccion. Lo mas probable es que el archivo `highs.wasm` no haya viajado con la funcion: revisar la copia, la huella y `static_files`.
- **Deshacer:** volver a desplegar la version anterior de la funcion en staging (no toca produccion).

## Produccion: despliegue de la funcion

Solo despues de que la prueba de humo en staging salio bien, y con el "¿lo hago?" y el OK del dueno.

- **Desarrollador:** apunta la CLI al proyecto de produccion y despliega exactamente igual que en staging: con Docker encendido, `npm ci && npm run functions:wasm`, comprobar la huella sha256 de arriba y `supabase functions deploy generate-weekly-plan` (nunca `--use-api`).
- **Comprobar:** en los registros de produccion no aparece ningun `lpLoadError` y una generacion de prueba termina bien.
- **Deshacer:** volver a desplegar la version anterior de la funcion (la base de datos no cambia).
