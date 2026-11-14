# Puesta en marcha del plan 2 (reglas, optimizador y recetas)

Lista de pasos en orden. Regla: antes de cada paso en producción, el desarrollador pregunta "¿lo hago?" y el dueño responde OK. Nada se hace en producción sin ese OK.

Quién: **Dueño** = tú. **Desarrollador** = el equipo/agentes.

Las secciones 1 a 5 van en orden. Cada paso dice **Quién** lo hace, **Comprobar** que salió bien y **Deshacer** si algo falla. Más abajo están las secciones de detalle (cómo se despliega la función y la prueba de humo de la calculadora) a las que remiten los pasos.

**Qué cambia con el plan 2, en palabras sencillas:** ahora el plan se arma con recetas sencillas (49, ya aprobadas por el dueño), una calculadora (HiGHS) busca la compra más barata que cumple tus metas sin pasarse del presupuesto, y si las metas no se pueden cumplir la app lo dice y ofrece "Quiero el plan igual". El presupuesto mínimo ahora es 130.000 COP por persona por semana.

> **ADVERTENCIA: el plan 2 depende del plan 1.** Las migraciones 010 a 014 (plan 1) deben estar aplicadas **antes** de la 015 y la 016: sin ellas el plan 2 no funciona. Además, **ni el plan 1 ni el plan 2 están todavía en `main`** (PR #13, en borrador). **No se publica nada en producción hasta que los dos estén unidos a `main`.**

## Antes de cualquier comando

- **Desarrollador:** confirmar a qué proyecto apunta la CLI, en staging y en producción: `supabase projects list` (el proyecto enlazado aparece marcado) y, si hace falta, `supabase link --project-ref <ref del proyecto>`. El identificador (ref) de producción se comparte en privado y **nunca se escribe en el repositorio**.
- **Cómo se aplican las migraciones:** igual que en el plan 1 y como dice el `README.md`: con el editor SQL de Supabase o con `supabase db push` después de `supabase link`. Siempre en orden numérico.

## 1. Staging: la base de datos
> **Atención:** las migraciones 010 a 014 (plan 1) deben estar ya aplicadas en el proyecto de pruebas; la 015 y la 016 no funcionan sin ellas. Si no lo están, se aplican primero (`docs/ROLLOUT-plan-1.md`, sección 1).

- **Quién:** Desarrollador, en el proyecto de pruebas de Supabase del plan 1 (debe tener ya las migraciones 010 a 014). Dueño: nada.
- **Hacer:**
  1. Aplicar la migración **015** (`supabase/migrations/015_cooking_preferences.sql`): agrega 4 columnas opcionales de cocina al perfil.
  2. Aplicar la migración **016** (`supabase/migrations/016_partial_plan_results.sql`): crea la tabla donde se guarda 30 minutos el primer intento para "Quiero el plan igual".
  3. Correr `supabase/tests/cooking_prefs_checks.sql`.
  4. Correr `supabase/tests/partial_plan_results_checks.sql` (necesita **dos usuarios de prueba**, para comprobar que cada uno solo ve y borra lo suyo).
  5. Correr los avisos de seguridad y de rendimiento (advisors) de Supabase.
- **Comprobar:** las dos pruebas SQL terminan sin error; los advisors no muestran nada grave en `profiles` ni en `partial_plan_results` (la tabla nueva debe tener RLS activo).
- **Deshacer:** ambas migraciones son aditivas (columnas opcionales y una tabla nueva): si hace falta, simplemente no se usan. **NO borrar el proyecto de pruebas:** también tiene lo del plan 1.

## 2. Staging: la función `generate-weekly-plan`
- **Quién:** Desarrollador, con Docker encendido.
- **Hacer:**
  1. Desplegar como dice la sección "Cómo se despliega" (más abajo): `npm ci && npm run functions:wasm`, comprobar la huella sha256 y `supabase functions deploy generate-weekly-plan` (nunca `--use-api`).
  2. La **prueba de humo de la calculadora** (sección más abajo): carga y una solución con CPU menor a 900 ms.
  3. Hacer **20 generaciones** (5 mezclas de metas por 4 perfiles).
  4. Mandar una petición como la del **web viejo**: un POST con cuerpo `{}` y el token de un usuario de prueba.
  5. Probar **"Quiero el plan igual"** con unas metas que no se pueden cumplir.
- **Comprobar:**
  - En los registros aparece `optimizer_result` en cada generación y su campo `cpu_ms` tiene un **p95 menor a 900** en las 20 generaciones. ("p95" quiere decir: 19 de cada 20 generaciones gastan menos que ese número.)
  - La petición `{}` nunca recibe `goals_unreachable`: recibe `budget_too_low` o `goal_incoherent`.
  - Con "Quiero el plan igual" (mismos datos, dentro de 30 minutos) llega el plan, el registro muestra `partial_plan_reused`, **no** aparece una fila nueva en `plan_generation_requests` y no hay una segunda llamada a OpenAI. Si antes se cambia el presupuesto o las metas, se genera de nuevo como siempre.
  - No aparece `lp_load_failed` en los registros.
- **Si falla:** no se pasa a producción. Lo más probable es que `highs.wasm` no haya viajado con la función (revisar copia, huella y `static_files`) o que gaste más CPU de lo medido en Node. Esta es la primera vez que la calculadora corre en el entorno real de Supabase (Deno); hasta ahora solo se probó en Node.
- **Deshacer:** volver a desplegar la versión anterior de la función en staging (no toca producción), como en "Cómo deshacer el despliegue de la función" (más abajo).

## 3. Recetas: revisión del dueño
- **Dueño:** **ya hecho el 2026-11-12:** el dueño aprobó las 49 recetas (todas están en `approved`, ver `docs/RECIPES.md`). Falta solo una mirada rápida desde el celular a dos pantallas de ejemplo (existen solo en la versión de desarrollo, `npm run dev`):
  - `/__preview/unreachable`: la pantalla "no se puede cumplir".
  - `/__preview/menu-recipes`: el menú con las recetas.
- **Desarrollador:** si el dueño corrige algo, se cambia por PR y se regenera la biblioteca de recetas.
- **Comprobar:** el dueño dice "listo". Producción espera ese "listo".
- **Deshacer:** una receta se corrige o se quita por PR (es un archivo de `data/recipes/`).

## 4. Producción, en este orden
Cada paso funciona con el anterior ya puesto. Antes de **cada uno**: el desarrollador pregunta **"¿lo hago?"** y el dueño responde OK. Nada se hace sin ese OK. Antes de empezar, el desarrollador confirma que `npm run check` está en verde en lo que se va a publicar y que la CLI apunta a **producción** (ver "Antes de cualquier comando").

**Orden de la publicación conjunta (plan 1 + plan 2, lo que prefiere el dueño):**
1. Migraciones **010 → 011 → 012 → 013 → 014 → 015 → 016**, una por una y en orden.
2. El trabajo de precios del plan 1 (`docs/ROLLOUT-plan-1.md`, sección 6, paso 2).
3. La función `generate-weekly-plan`.
4. La web (versión 0.1.0).

Si el plan 1 ya estuviera en producción, se salta lo que ya esté hecho y se sigue con los pasos de abajo.

### 4.1 Migración 015 en producción
> **Atención:** las migraciones 010 a 014 (plan 1) deben estar ya aplicadas en producción; si no, se aplican primero, en el orden de arriba. Y no se publica nada hasta que el plan 1 y el plan 2 estén unidos a `main`.

- **Quién:** Desarrollador.
- **Comprobar:** el perfil tiene las 4 columnas nuevas (`cooking_weekday_minutes`, `cooking_level`, `kitchen_appliances`, `batch_cooking`); la función vieja y la web vieja siguen funcionando igual.
- **Deshacer:** es aditiva; si hace falta, no se usan las columnas.

### 4.2 Migración 016 en producción, antes de la función
- **Quién:** Desarrollador.
- **Comprobar:** existe `partial_plan_results` con RLS activo y `partial_plan_results_checks.sql` (con dos usuarios) pasa. Sin la 016 la función nueva funciona igual, pero nunca reutiliza el primer intento.
- **Deshacer:** es una tabla nueva y vacía; si hace falta, no se usa.

### 4.3 La función `generate-weekly-plan`
- **Quién:** Desarrollador, con Docker encendido y apuntando a producción. **Antes de desplegar, anota el commit que hoy está en producción** (para poder volver). Después sigue la sección "Producción: despliegue de la función" (más abajo).
- **Comprobar:**
  - Los secretos de producción existen (solo los nombres, nunca los valores): `OPENAI_API_KEY` y `SUPABASE_SERVICE_ROLE_KEY` (por ejemplo con `supabase secrets list`).
  - Una generación de prueba termina bien; en los registros hay `optimizer_result` con `cpu_ms` bajo 900 y ningún `lp_load_failed`; una petición `{}` nunca recibe `goals_unreachable`.
- **Deshacer:** ver "Cómo deshacer el despliegue de la función" (más abajo). La base se queda igual: la función vieja funciona con las migraciones 010 a 016 puestas, porque todas son aditivas (columnas y tablas nuevas; nada se borra ni se renombra).

### 4.4 La web, versión 0.1.0
- **Quién:** Desarrollador (la publica igual que en el plan 1). Antes de publicar, comprobar que `package.json` dice `"version": "0.1.0"` (con esa versión la web avisa a la función de que entiende `goals_unreachable`).
- **Comprobar:** el plan se genera y muestra las recetas; con un presupuesto muy bajo sale el aviso del mínimo (130.000 por persona); con metas imposibles sale "no se puede cumplir" y "Quiero el plan igual" entrega el plan; los planes viejos del historial abren.
- **Deshacer:** volver al despliegue anterior de la web. Se puede volver a la web vieja aunque la 015 y la 016 ya estén puestas: las columnas son opcionales. (Una web vieja con la función nueva sigue funcionando: recibe `budget_too_low` o `goal_incoherent` en vez de `goals_unreachable`.)

## 5. Después del lanzamiento
- **Quién:** Desarrollador, durante **una semana**, avisando al dueño de lo que vea.
- **Qué mirar en los registros de la función** (estos eventos existen hoy; nombres comprobados en el código):
  - `plan_goals_unreachable`: planes que no cumplen todas las metas (cuántos conflictos trae y si un presupuesto mayor lo arregla).
  - `plan_generated` con `status` `full` o `partial`: cuántos planes salen completos y cuántos salen con "Quiero el plan igual".
  - `plan_over_budget`: la compra final se pasaba del presupuesto.
  - `generation_budget_exhausted`: se acabó el tiempo o el número de llamadas antes de terminar.
  - `plan_attempt_rejected`: intentos que se descartaron (con su código).
  - `generation_usage`: cuánto se gastó en llamadas al modelo.
  - `optimizer_result` (campo `cpu_ms`), `optimizer_cpu_exhausted` y `lp_load_failed`: el CPU del optimizador y si la calculadora no cargó.
  - `plan_budget_too_low`: se respondió `budget_too_low` (una vez por petición). `step` dice dónde se decidió: `floor` (por debajo del mínimo de 130.000 pesos por persona, sin gastar llamadas), `optimizer` (el contador no logró una compra dentro del presupuesto) o `assemble` (la última revisión de la lista de mercado). `household` es el tamaño del hogar (de 6 en adelante se anota 6) y `budget_ratio` dice, por cuartos, qué parte del presupuesto necesario tenía la persona (`lt_0.25`, `0.25_0.5`, `0.5_0.75`, `0.75_1` o `unknown`). Nunca se anota el presupuesto exacto.
  - `plan_restrictions_too_strict`: se respondió `restrictions_too_strict` (una vez por petición). `slots` dice qué comidas se quedaron sin recetas suficientes (por ejemplo `almuerzo,cena`), `short_slots` cuántas son y `min_recipes` cuántas recetas quedaron en la comida más pobre. Nunca se anotan las restricciones de la persona.
- **Comprobar:** ningún aumento raro de esos avisos y el CPU sigue bajo 900 ms. Si un perfil frecuente recibe `restrictions_too_strict` es porque hay pocas recetas para ese caso (por ejemplo, veganos que no cocinan): **agregar recetas**, por PR y con el OK del dueño.
- **Deshacer:** se corrige y se vuelve a desplegar; ver el "Deshacer" de cada paso.

## Cómo se despliega `generate-weekly-plan` (staging y producción, siempre igual)

**Qué es:** el plan usa una calculadora matemática llamada HiGHS para encontrar la compra más barata que cumple tus metas. Viene en un archivo aparte (`highs.wasm`, unos 3,5 MB), como un motor que se instala dentro del carro. Ese motor no se guarda en git: se copia justo antes de cada despliegue. Si se olvida la copia, la función sale sin motor.

- **Desarrollador**, con Docker encendido y desde la carpeta del proyecto:

  ```bash
  npm ci && npm run functions:wasm
  supabase functions deploy generate-weekly-plan
  ```

  (o `npm ci && npm run deploy:plan-fn`, que hace la copia y el despliegue seguidos).
- **Nunca** usar `--use-api` con esta función: ese modo no sube archivos estáticos y la función quedaría sin motor.
- `npm run functions:wasm` falla con un mensaje claro si falta el archivo (por ejemplo, si no se corrió `npm ci`). Si falla, no se despliega.
- **Comprobar el archivo copiado** (que sea exactamente el de highs 1.15.4): su huella sha256 debe ser

  `f13134e3e335e7bad984ff12abeb41e86e0eeeb1752ae8a85322cc6839df8acd`

  Se mira con `sha256sum supabase/functions/generate-weekly-plan/highs.wasm` (en Windows: `certutil -hashfile supabase\functions\generate-weekly-plan\highs.wasm SHA256`). Si la huella no coincide, no se despliega.
- La función lleva su `deno.json` (`"highs": "npm:highs@1.15.4"`), y `supabase/config.toml` lista `highs.wasm` en `static_files` con `verify_jwt = true`.

### Cómo deshacer el despliegue de la función
- **Antes de desplegar**, el desarrollador anota el commit que está hoy en producción.
- **Para volver atrás:** `git checkout <ese commit>` y `supabase functions deploy generate-weekly-plan`. La versión vieja no necesita `highs.wasm`.
- **Si no había versión anterior** (la función es nueva en ese proyecto): deshacer es dejar la web vieja, es decir, no hacer el paso 4.4.

## Paso obligatorio antes de producción: prueba de humo de la calculadora (staging)

Antes de salir a la calle (producción) hay que encender el carro en el taller (staging) y ver que arranca y que no gasta más de la cuenta.

- **Desarrollador:**
  1. Despliega `generate-weekly-plan` en **staging** como dice la sección anterior (copia, huella, despliegue con Docker).
  2. Prueba de humo: una llamada que cargue la calculadora (`prepareLp()`) y resuelva un problema pequeño (`solveLp`, por ejemplo el de la dieta de `lp.test.mjs`, cuyo resultado es 0.08). La función ya llama a la calculadora (tarea 13): basta una generación normal, que carga el motor antes de la primera llamada a OpenAI y deja `optimizer_result` en los registros. Si se quiere probar solo el motor, se puede usar una función temporal solo en staging y borrarla al terminar.
- **Comprobar:**
  - `prepareLp()` responde `true` (el motor cargó) y el resultado es factible con costo 0.08. Si responde `false`, el código de `lpLoadError()` dice por qué: `wasm_not_found` (el archivo no viajó), `wasm_instantiate_failed` (el archivo está dañado o es de otra versión) o `load_timeout` (tardó más de 5 s).
  - En los registros de Supabase, el **tiempo de CPU** de esa llamada (carga + una solución) es **menor a 900 ms**. En pruebas locales la carga gasta unos 50 ms y cada solución entre 10 y 100 ms.
  - Una segunda llamada a la misma instancia no vuelve a cargar el motor.
- **Si falla:** no se pasa a producción. Lo más probable es que el archivo `highs.wasm` no haya viajado con la función: revisar la copia, la huella y `static_files`.
- **Deshacer:** volver a desplegar la versión anterior de la función en staging (no toca producción).

## Producción: despliegue de la función

Solo después de que la prueba de humo en staging salió bien, y con el "¿lo hago?" y el OK del dueño. Se hace **exactamente igual que en staging** (sección "Cómo se despliega", arriba), con la CLI apuntando a producción.

- **Comprobar:** en los registros de producción no aparece `lp_load_failed` y una generación de prueba termina bien.
- **Deshacer:** ver "Cómo deshacer el despliegue de la función" (arriba).
