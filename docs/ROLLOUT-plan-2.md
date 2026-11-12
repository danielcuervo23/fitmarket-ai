# Puesta en marcha del plan 2 (reglas, optimizador y recetas)

Lista de pasos en orden. Regla: antes de cada paso en produccion, el desarrollador pregunta "¿lo hago?" y el dueno responde OK. Nada se hace en produccion sin ese OK.

Quien: **Dueno** = tu. **Desarrollador** = el equipo/agentes.

> Este documento lo empezo la tarea 8 (la calculadora de compras). La tarea 18 lo completa con el resto de pasos (migracion 015, revision de recetas, produccion en orden y seguimiento).

## Paso obligatorio antes de produccion: prueba de humo de la calculadora (staging)

**Que es:** el plan usa una calculadora matematica llamada HiGHS para encontrar la compra mas barata que cumple tus metas. Viene en un archivo aparte (`highs.wasm`, unos 3,5 MB), como un motor que se instala dentro del carro. Antes de salir a la calle (produccion) hay que encender el carro en el taller (staging) y ver que arranca y que no gasta mas de la cuenta.

- **Desarrollador:**
  1. Corre `npm run functions:wasm` (copia el motor `highs.wasm` desde `node_modules` a la carpeta de la funcion; ese archivo no se guarda en git).
  2. Despliega `generate-weekly-plan` en **staging** con la CLI de Supabase usando Docker (no con `--use-api`: ese modo no sube archivos estaticos). La funcion lleva su `deno.json` (`"highs": "npm:highs@1.15.4"`) y `supabase/config.toml` lista `highs.wasm` en `static_files`.
  3. Prueba de humo: una llamada que cargue la calculadora (`prepareLp()`) y resuelva un problema pequeno (`solveLp`, por ejemplo el de la dieta de `lp.test.mjs`, cuyo resultado es 0.08). Si la funcion todavia no llama a la calculadora (eso llega con la tarea 13), se usa una funcion de prueba temporal solo en staging y se borra al terminar.
- **Comprobar:**
  - `prepareLp()` responde `true` (el motor cargo) y el resultado es factible con costo 0.08.
  - En los registros de Supabase, el **tiempo de CPU** de esa llamada (carga + una solucion) es **menor a 900 ms**. En pruebas locales la carga gasta unos 50 ms y cada solucion entre 10 y 100 ms.
  - Una segunda llamada a la misma instancia no vuelve a cargar el motor.
- **Si falla:** no se pasa a produccion. Lo mas probable es que el archivo `highs.wasm` no haya viajado con la funcion: revisar el paso 1 y `static_files`.
- **Deshacer:** volver a desplegar la version anterior de la funcion en staging (no toca produccion).
