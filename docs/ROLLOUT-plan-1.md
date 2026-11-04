# Puesta en marcha del plan 1 (catalogo y precios)

Lista de pasos en orden. Regla: antes de cada paso en produccion, el desarrollador pregunta "¿lo hago?" y el dueno responde OK. Nada se hace en produccion sin ese OK.

Quien: **Dueno** = tu. **Desarrollador** = el equipo/agentes.

## 1. Proyecto de prueba (staging) en Supabase
- **Dueno:** crea un proyecto de Supabase GRATIS para pruebas (es una copia de ensayo, como un taller de practica antes de la casa real) y pasa la URL y los accesos al desarrollador de forma segura.
- **Desarrollador:** aplica las migraciones 010, 011, 012 y 013 en ese proyecto; corre `supabase/tests/catalog_checks.sql`; corre los avisos de seguridad y rendimiento (advisors) de Supabase.
- **Comprobar:** `select count(*) from foods` da el mismo numero de alimentos que `foods.json`; las pruebas SQL pasan; los advisors no muestran nada grave.
- **Deshacer:** borrar el proyecto de pruebas (no toca produccion).

## 2. Entorno de GitHub `prices`
- **Dueno:** en GitHub crea el environment `prices` con los secretos `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` (primero los de staging). Opcional: `USDA_API_KEY`.
- **Comprobar:** el entorno aparece y los secretos estan guardados (nadie los ve despues).
- **Deshacer:** borrar los secretos o el entorno; rotar la llave si se sospecha de fuga.

## 3. Correr el trabajo semanal contra staging
- **Desarrollador (con OK del dueno):** lanza el workflow con `dry_run=true` (lee y revisa, no escribe) y despues con `dry_run=false`.
- **Comprobar:** `select store_id, count(*) from current_prices where city = 'bucaramanga' group by 1`; y filas en `city_reference_prices`.
- **Deshacer:** borrar las filas de `prices` y `city_reference_prices` de staging; los precios viejos se conservan.

## 4. Completar los mapeos de alimentos por tienda
- **Desarrollador:** mapear los alimentos que faltan en Carulla, Jumbo, Exito y D1 usando el sitemap de cada tienda.
- **Verificar la papa de Carulla:** el nombre del producto dice x180gr pero esta mapeada como 1 kg.
- **Averiguar como cada tienda elige Bucaramanga:** hoy todos los selectores estan en `verified:false`.
- **Exito** respondio 429 (demasiadas peticiones) en la prueba real: si se repite, se para y se avisa al dueno (no se insiste).
- **Comprobar:** las pruebas de mapeos pasan y una corrida en dry-run no trae errores.
- **Deshacer:** revertir el commit del mapeo.

## 5. Revisiones del dueno
- **Dueno:** revisar los precios de referencia estaticos de `cebolla_junca` y `cilantro` (parecen muy altos frente al DANE).
- **Dueno:** aprobar los recargos sobre los precios del DANE (fresco 1.35, proteina 1.20, abarrotes 1.15) y el texto de atribucion al DANE.
- **Deshacer:** son valores del codigo; se corrigen y se vuelve a desplegar.

## 6. Produccion, en este orden
Cada paso funciona con el anterior ya puesto. Antes de cada uno: "¿lo hago?" y OK del dueno.
1. **Migraciones** 010 → 011 → 012 → 013 en produccion. Comprobar el conteo de `foods`. La funcion vieja sigue funcionando (ignora las tablas nuevas). Deshacer: las migraciones son aditivas; si hace falta, simplemente no se usan las tablas nuevas.
2. **Trabajo de precios:** cambiar los secretos del entorno `prices` a los de produccion, correr con `dry_run=true` y luego real. Deshacer: borrar las filas nuevas de `prices` y `city_reference_prices`.
3. **Edge Function** `generate-weekly-plan` (opcional `CATALOG_CACHE_TTL_MS`). Comprobar: el log muestra `catalog_origin` = `db` y un usuario sin ciudad obtiene el mismo total que antes. Deshacer: volver a desplegar la funcion anterior; la base se queda igual.
4. **Web.** Comprobar: la pantalla del mercado muestra "Actualizado el ..." para usuarios de Bucaramanga con precios leidos y "Aproximado" en los demas; los planes viejos del historial abren. Deshacer: volver al despliegue anterior de la web.

## 7. Revision legal (pendiente)
- **Dueno:** un abogado debe revisar la lectura de precios de las tiendas antes del lanzamiento publico. Mientras tanto vale el permiso del dueno bajo las precauciones (solo paginas de producto, 5 s o mas entre peticiones, parar ante 429/403, solo precio y tamano, parar si una tienda lo pide). Ara no se lee.
- **Deshacer:** poner `allowed: false` en `scripts/prices/policy.json` para la tienda que corresponda.

## 8. Comprobaciones en el navegador (pendientes)
- **Desarrollador y dueno:** el selector de ciudad en el perfil y las etiquetas de precio en pantallas angostas (celular).
- **Deshacer:** corregir el diseno y volver a desplegar la web.
