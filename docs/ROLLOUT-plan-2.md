# Puesta en marcha del plan 2 (reglas, optimizador y recetas)

Lista de pasos en orden. Regla: antes de cada paso en produccion, el desarrollador pregunta "¿lo hago?" y el dueno responde OK. Nada se hace en produccion sin ese OK.

Quien: **Dueno** = tu. **Desarrollador** = el equipo/agentes.

Los pasos 1 a 5 van en orden. Cada paso dice **Quien** lo hace, **Comprobar** que salio bien y **Deshacer** si algo falla. Mas abajo estan las secciones de detalle (como se despliega la funcion y la prueba de humo de la calculadora) a las que remiten los pasos.

**Que cambia con el plan 2, en palabras sencillas:** ahora el plan se arma con recetas sencillas (49, ya aprobadas por el dueno), una calculadora (HiGHS) busca la compra mas barata que cumple tus metas sin pasarse del presupuesto, y si las metas no se pueden cumplir la app lo dice y ofrece "Quiero el plan igual". El presupuesto minimo ahora es 130.000 COP por persona por semana.

## 1. Staging: la base de datos
- **Quien:** Desarrollador, en el proyecto de pruebas de Supabase del plan 1. Dueno: nada.
- **Hacer:**
  1. Aplicar la migracion **015** (`supabase/migrations/015_cooking_preferences.sql`): agrega 4 columnas opcionales de cocina al perfil.
  2. Aplicar la migracion **016** (`supabase/migrations/016_partial_plan_results.sql`): crea la tabla donde se guarda 30 minutos el primer intento para "Quiero el plan igual".
  3. Correr `supabase/tests/cooking_prefs_checks.sql`.
  4. Correr `supabase/tests/partial_plan_results_checks.sql` (necesita **dos usuarios de prueba**, para comprobar que cada uno solo ve y borra lo suyo).
  5. Correr los avisos de seguridad y de rendimiento (advisors) de Supabase.
- **Comprobar:** las dos pruebas SQL terminan sin error; los advisors no muestran nada grave en `profiles` ni en `partial_plan_results` (la tabla nueva debe tener RLS activo).
- **Deshacer:** ambas migraciones son aditivas (columnas opcionales y una tabla nueva): si hace falta, simplemente no se usan. En staging tambien se puede borrar el proyecto de pruebas.

## 2. Staging: la funcion `generate-weekly-plan`
- **Quien:** Desarrollador, con Docker encendido.
- **Hacer:**
  1. Desplegar como dice la seccion "Como se despliega" (mas abajo): `npm ci && npm run functions:wasm`, comprobar la huella sha256 y `supabase functions deploy generate-weekly-plan` (nunca `--use-api`).
  2. La **prueba de humo de la calculadora** (seccion mas abajo): carga y una solucion con CPU menor a 900 ms.
  3. Hacer **20 generaciones** (5 mezclas de metas por 4 perfiles).
  4. Mandar una peticion como la del **web viejo** (cuerpo `{}`).
  5. Probar **"Quiero el plan igual"** con unas metas que no se pueden cumplir.
- **Comprobar:**
  - En los registros aparece `optimizer_result` en cada generacion y su campo `cpu_ms` tiene un **p95 menor a 900** en las 20 generaciones. ("p95" quiere decir: 19 de cada 20 generaciones gastan menos que ese numero.)
  - La peticion `{}` nunca recibe `goals_unreachable`: recibe `budget_too_low` o `goal_incoherent`.
  - Con "Quiero el plan igual" (mismos datos, dentro de 30 minutos) llega el plan, el registro muestra `partial_plan_reused`, **no** aparece una fila nueva en `plan_generation_requests` y no hay una segunda llamada a OpenAI. Si antes se cambia el presupuesto o las metas, se genera de nuevo como siempre.
  - No aparece `lp_load_failed` en los registros.
- **Si falla:** no se pasa a produccion. Lo mas probable es que `highs.wasm` no haya viajado con la funcion (revisar copia, huella y `static_files`) o que gaste mas CPU de lo medido en Node. Esta es la primera vez que la calculadora corre en el entorno real de Supabase (Deno); hasta ahora solo se probo en Node.
- **Deshacer:** volver a desplegar la version anterior de la funcion en staging (no toca produccion).

## 3. Recetas: revision del dueno
- **Dueno:** **ya hecho el 2026-11-12:** el dueno aprobo las 49 recetas (todas estan en `approved`, ver `docs/RECIPES.md`). Falta solo una mirada rapida desde el celular a dos pantallas de ejemplo (existen solo en la version de desarrollo, `npm run dev`):
  - `/__preview/unreachable`: la pantalla "no se puede cumplir".
  - `/__preview/menu-recipes`: el menu con las recetas.
- **Desarrollador:** si el dueno corrige algo, se cambia por PR y se regenera la biblioteca de recetas.
- **Comprobar:** el dueno dice "listo". Produccion espera ese "listo".
- **Deshacer:** una receta se corrige o se quita por PR (es un archivo de `data/recipes/`).

## 4. Produccion, en este orden
Cada paso funciona con el anterior ya puesto. Antes de **cada uno**: el desarrollador pregunta **"¿lo hago?"** y el dueno responde OK. Nada se hace sin ese OK. Antes de empezar, el desarrollador confirma que `npm run check` esta en verde en lo que se va a publicar.

**Antes del plan 2: el plan 1.** El plan 2 se apoya en las migraciones 010 a 014 y en el catalogo y los precios del plan 1. Si el plan 1 todavia no esta en produccion, se hace primero su puesta en marcha (`docs/ROLLOUT-plan-1.md`, seccion 6), **o junto con esta**, que es lo que prefiere el dueno: publicar los dos planes juntos. En ese caso las migraciones van en un solo bloque 010 → 011 → 012 → 013 → 014 → 015 → 016, y la funcion y la web se publican una sola vez al final, con las mismas comprobaciones.

1. **Migracion 015** en produccion.
   - **Quien:** Desarrollador.
   - **Comprobar:** el perfil tiene las 4 columnas nuevas (`cooking_weekday_minutes`, `cooking_level`, `kitchen_appliances`, `batch_cooking`); la funcion vieja y la web vieja siguen funcionando igual.
   - **Deshacer:** es aditiva; si hace falta, no se usan las columnas.
2. **Migracion 016** en produccion, **antes** de la funcion.
   - **Quien:** Desarrollador.
   - **Comprobar:** existe `partial_plan_results` con RLS activo y `partial_plan_results_checks.sql` (con dos usuarios) pasa. Sin 016 la funcion nueva funciona igual, pero nunca reutiliza el primer intento.
   - **Deshacer:** es una tabla nueva y vacia; si hace falta, no se usa.
3. **Edge Function** `generate-weekly-plan`.
   - **Quien:** Desarrollador, con Docker encendido y apuntando al proyecto de produccion (seccion "Produccion: despliegue de la funcion", mas abajo): `npm ci && npm run functions:wasm`, comprobar la huella sha256 y `supabase functions deploy generate-weekly-plan` (nunca `--use-api`).
   - **Comprobar:** una generacion de prueba termina bien; en los registros hay `optimizer_result` con `cpu_ms` bajo 900 y ningun `lp_load_failed`; una peticion `{}` nunca recibe `goals_unreachable`.
   - **Deshacer:** volver a desplegar la version anterior de la funcion (la base se queda igual; las migraciones 015 y 016 no estorban).
4. **Web, version 0.1.0.**
   - **Quien:** Desarrollador (la publica igual que en el plan 1).
   - **Comprobar:** el plan se genera y muestra las recetas; con un presupuesto muy bajo sale el aviso del minimo (130.000 por persona); con metas imposibles sale "no se puede cumplir" y "Quiero el plan igual" entrega el plan; los planes viejos del historial abren.
   - **Deshacer:** volver al despliegue anterior de la web. (Una web vieja con la funcion nueva sigue funcionando: recibe `budget_too_low` o `goal_incoherent` en vez de `goals_unreachable`.)

## 5. Despues del lanzamiento
- **Quien:** Desarrollador, durante **una semana**, avisando al dueno de lo que vea. Mirar en los registros de la funcion:
  - Con que frecuencia salen `goals_unreachable`, `restrictions_too_strict` y `budget_too_low`, en proporcion a las generaciones totales.
  - El CPU del optimizador (`cpu_ms` en `optimizer_result`) y si aparece `optimizer_cpu_exhausted` o `lp_load_failed`.
- **Comprobar:** ningun aumento raro de esos tres avisos y el CPU sigue bajo 900 ms. Si un perfil frecuente recibe `restrictions_too_strict` es porque hay pocas recetas para ese caso (por ejemplo, veganos que no cocinan): **agregar recetas**, por PR y con el OK del dueno.
- **Deshacer:** se corrige y se vuelve a desplegar; ver el "Deshacer" de cada paso.

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
  2. Prueba de humo: una llamada que cargue la calculadora (`prepareLp()`) y resuelva un problema pequeno (`solveLp`, por ejemplo el de la dieta de `lp.test.mjs`, cuyo resultado es 0.08). La funcion ya llama a la calculadora (tarea 13): basta una generacion normal, que carga el motor antes de la primera llamada a OpenAI y deja `optimizer_result` en los registros. Si se quiere probar solo el motor, se puede usar una funcion temporal solo en staging y borrarla al terminar.
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
