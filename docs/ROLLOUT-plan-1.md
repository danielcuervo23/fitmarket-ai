# Puesta en marcha del plan 1 (catalogo y precios)

Lista de pasos en orden. Regla: antes de cada paso en produccion, el desarrollador pregunta "¿lo hago?" y el dueno responde OK. Nada se hace en produccion sin ese OK.

Quien: **Dueno** = tu. **Desarrollador** = el equipo/agentes.

## 1. Proyecto de prueba (staging) en Supabase
- **Dueno:** crea un proyecto de Supabase GRATIS para pruebas (es una copia de ensayo, como un taller de practica antes de la casa real) y pasa la URL y los accesos al desarrollador de forma segura.
- **Desarrollador:** aplica las migraciones 010, 011, 012, 013 y 014 en ese proyecto (si 012 ya estaba aplicada, basta con aplicar 014); corre `supabase/tests/catalog_checks.sql`; corre los avisos de seguridad y rendimiento (advisors) de Supabase.
- **Comprobar:** `select count(*) from foods` da el mismo numero de alimentos que `foods.json`; las pruebas SQL pasan; los advisors no muestran nada grave.
- **Deshacer:** borrar el proyecto de pruebas (no toca produccion).

## 2. Entorno de GitHub `prices`
- **Dueno:** en GitHub crea el environment `prices` con los secretos `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` (primero los de staging). Opcional: `USDA_API_KEY`.
- **Dueno: ponle candado al entorno** (asi la llave solo se usa desde la rama principal y con tu permiso; es como una caja fuerte que solo se abre en la oficina y con tu firma):
  1. En GitHub entra al repositorio → **Settings** → **Environments** → **prices**.
  2. En **Deployment branches and tags** elige **Selected branches and tags**, toca **Add deployment branch or tag rule** y escribe `main`. Guarda.
  3. Marca **Required reviewers**, escribe tu usuario de GitHub y toca **Save protection rules**.
  4. Desde ahora, cada vez que corra un trabajo de precios, GitHub te pide aprobarlo (boton **Review deployments** → **Approve and deploy**). Si no lo esperabas, toca **Reject**.
- **Bueno saber:** el modo de prueba (`dry_run=true`) tambien usa la llave, porque necesita leer la base para comparar precios (no escribe nada). Por eso tambien te pedira aprobacion.
- **Comprobar:** el entorno aparece, los secretos estan guardados (nadie los ve despues), dice "main" en las ramas permitidas y tu usuario como revisor.
- **Deshacer:** borrar los secretos o el entorno; rotar la llave si se sospecha de fuga.

## 3. Correr el trabajo semanal contra staging
- **Desarrollador (con OK del dueno):** lanza el workflow con `dry_run=true` (lee y revisa, no escribe) y despues con `dry_run=false`.
- **Comprobar:** `select store_id, count(*) from current_prices where city = 'bucaramanga' group by 1`; y filas en `city_reference_prices`.
- **Deshacer:** borrar las filas de `prices` y `city_reference_prices` de staging; los precios viejos se conservan.

## 4. Completar los mapeos de alimentos por tienda
- **Desarrollador:** mapear los alimentos que faltan en Carulla, Jumbo, Exito y D1 usando el sitemap de cada tienda.
- **Verificar la papa de Carulla:** el nombre del producto dice x180gr pero esta mapeada como 1 kg.
- **Averiguar como cada tienda elige Bucaramanga:** hoy todos los selectores estan en `verified:false`.
- **Los precios solo se escriben cuando el selector de ciudad esta verificado.** Mientras una tienda siga en `verified:false`, el trabajo semanal NO guarda sus precios (los cuenta como `city_unverified` en el resumen) y el dry-run solo informa que leeria. Para escribir de todos modos hay que poner `PRICES_ALLOW_UNVERIFIED_CITY=1` a proposito; no esta en el workflow y no debe ponerse en produccion.
- **Exito** respondio 429 (demasiadas peticiones) en la prueba real: si se repite, se para y se avisa al dueno (no se insiste).
- **Comprobar:** las pruebas de mapeos pasan y una corrida en dry-run no trae errores.
- **Deshacer:** revertir el commit del mapeo.

### 4b. Anotar precios a mano (Carulla, Exito y D1)
Carulla y Exito bloquean al robot, y D1 cambia sus precios segun la ciudad (el robot solo ve el precio por defecto), asi que los precios de Bucaramanga los anota una persona con un boton del navegador. Es como ir al supermercado con una libreta, pero la libreta copia el precio sola.
1. **Instala el boton.** Abre el archivo `tools/anotador/index.html` en Chrome y arrastra el boton verde **"Anotar precio"** a la barra de marcadores (si no la ves: `Ctrl` + `Shift` + `B`).
2. **Elige Bucaramanga en la tienda.** En carulla.com (o exito.com) usa el selector de ciudad o direccion de la propia tienda y elige Bucaramanga.
3. **Abre cada producto y toca el boton.** Por ejemplo "Arroz Diana 500 g". El recuadro muestra el nombre, el precio normal y el tamano; sugiere el alimento (puedes cambiarlo). Marca "Tengo Bucaramanga seleccionada en esta tienda" y toca **Guardar**. Ves cuantos llevas ("12 de 70 anotados") y cuales faltan. Si te pide recargar, presiona `F5` y vuelve a tocar el boton.
4. **Exporta y entrega.** Toca **Exportar**: se descarga `precios-carulla-AAAA-MM-DD.json`. Entregaselo al desarrollador o ponlo en la carpeta `data/manual-prices`.
- **Desarrollador:** guarda el archivo en `data/manual-prices/`, corre `npm run prices:import -- <archivo>` (prueba, no cambia nada), luego `npm run prices:import -- --mappings-only <archivo>` y hace commit de los mapeos. Para escribir los precios, con OK del dueno: workflow **Manual prices import** con `dry_run=true` y luego `dry_run=false` (o `--write` en local con las variables de entorno).
- **Comprobar:** `select count(*) from current_prices cp join store_products sp on sp.id = cp.store_product_id where sp.store_id = 'Carulla' and cp.city = 'bucaramanga'`.
- **Deshacer:** borrar las filas de `prices` de ese dia y tienda; revertir el commit de los mapeos. Los precios de mas de 45 dias no se importan.

## 5. Revisiones del dueno
- ~~**Dueno:** revisar los precios de referencia estaticos de `cebolla_junca` y `cilantro`.~~ Hecho el 2026-11-04: el dueno aprobo los nuevos valores (migracion 014, detalle en `docs/DATA_SOURCES.md`). Nota: el plan 2 tambien pensaba usar el numero 014; el que se una despues debe renumerar la suya.
- **Dueno:** aprobar los recargos sobre los precios del DANE (fresco 1.35, proteina 1.20, abarrotes 1.15) y el texto de atribucion al DANE.
- **Deshacer:** son valores del codigo; se corrigen y se vuelve a desplegar.

## 6. Produccion, en este orden
Cada paso funciona con el anterior ya puesto. Antes de cada uno: "¿lo hago?" y OK del dueno.
1. **Migraciones** 010 → 011 → 012 → 013 → 014 en produccion. Comprobar el conteo de `foods`. La funcion vieja sigue funcionando (ignora las tablas nuevas). Deshacer: las migraciones son aditivas; si hace falta, simplemente no se usan las tablas nuevas.
2. **Trabajo de precios:** cambiar los secretos del entorno `prices` a los de produccion, correr con `dry_run=true` y luego real. Deshacer: borrar las filas nuevas de `prices` y `city_reference_prices`.
3. **Edge Function** `generate-weekly-plan` (opcional `CATALOG_CACHE_TTL_MS`). Comprobar: el log muestra `catalog_origin` = `db` y un usuario sin ciudad obtiene el mismo total que antes. Deshacer: volver a desplegar la funcion anterior; la base se queda igual.
4. **Web.** Comprobar: la pantalla del mercado muestra "Actualizado el ..." para usuarios de Bucaramanga con precios leidos y "Aproximado" en los demas; los planes viejos del historial abren. Deshacer: volver al despliegue anterior de la web.

## 7. Revision legal (pendiente)
- **Dueno:** un abogado debe revisar la lectura de precios de las tiendas antes del lanzamiento publico. Mientras tanto vale el permiso del dueno bajo las precauciones (solo paginas de producto, 5 s o mas entre peticiones, parar ante 429/403, solo precio y tamano, parar si una tienda lo pide). Ara no se lee.
- **Deshacer:** poner `allowed: false` en `scripts/prices/policy.json` para la tienda que corresponda.

## 8. Comprobaciones en el navegador (pendientes)
- **Desarrollador y dueno:** el selector de ciudad en el perfil y las etiquetas de precio en pantallas angostas (celular).
- **Deshacer:** corregir el diseno y volver a desplegar la web.
