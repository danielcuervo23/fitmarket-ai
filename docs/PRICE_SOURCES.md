# Fuentes de precios: revision legal de las 5 tiendas (Bucaramanga)

Fecha de la revision: 2026-11-04.

> Aviso: es una revision razonada hecha por el equipo, **no es asesoria legal**. El dueno ya tomo la decision de abajo; la revision legal profesional antes del lanzamiento publico sigue pendiente. Regla aplicada: ante la duda, no se lee la tienda.

El robot se identifica como `FitMarketPriceBot/1.0 (+https://fitmarket-ai.vercel.app)` (URL del proyecto, no un correo personal). El archivo `scripts/prices/policy.json` es la version para maquinas de este documento; el lector de precios solo usa tiendas con `allowed: true`. El texto `bucaramanga.how` es solo documentacion: el codigo nunca lo interpreta.

## Decision del dueno (2026-11-04)

El dueno autorizo leer **Exito, Carulla, D1 y Jumbo**; leyo el mismo los terminos de D1 y de Jumbo. **Ara sigue en no**, porque sus terminos lo prohiben expresamente. Se le recomendo una **revision legal antes del lanzamiento publico**; esa revision esta **pendiente**.

Precauciones obligatorias (tambien en `policy.json`):
- Solo paginas de producto individuales (por ejemplo `/<slug>/p`) que robots.txt no bloquee. Nunca `/api/`, `/s?`, `/busca*` ni rutas o parametros bloqueados por robots.txt.
- Lectura semanal, despacio: al menos 5000 ms entre peticiones, con el user agent identificado, y parar si llega un 429 o un bloqueo.
- Solo se guardan el precio regular y el tamano del paquete. Nunca fotos, descripciones ni logos.
- Si una tienda pide parar, se para de inmediato y se pasa a `allowed: false`.

## Resumen

| Tienda | Se puede leer | Motivo corto |
|---|---|---|
| D1 | Si | Autorizado por el dueno (2026-11-04), solo paginas de producto |
| Ara | No | Terminos prohiben spiders y copia automatica |
| Exito | Si | Autorizado por el dueno; terminos sin prohibicion explicita |
| Carulla | Si | Igual que Exito (misma plataforma) |
| Jumbo | Si | Autorizado por el dueno (2026-11-04), solo paginas de producto |

Nota: la forma de elegir Bucaramanga en cada tienda aun no esta comprobada; cada modulo de tienda la define y la verifica (el texto `how` es solo documentacion).

Lo que sigue es la revision tecnica original del 2026-11-04, previa a la decision del dueno; los veredictos de abajo quedan superados por la decision de arriba (salvo Ara).

## D1 (www.d1.com.co; domicilios.tiendasd1.com redirige ahi)
- Actualizacion 2026-11-04: `domicilios.tiendasd1.com` redirige a `www.d1.com.co`. Se leyo `https://www.d1.com.co/robots.txt` (una peticion): permite todo salvo `/account/*`, `/login/*`, `/checkout/*`, `/busca/*`, `/quick-view/*`, `/espiar/*`, `/buscapagina/*` y los parametros `initialMap=`, `initialQuery=`, `map=`, `searchState=`, `sc=`, `riode=`, `workspace=`, `OrderBy=`, `srlid=`, `utm_*`. Las paginas de producto `/<slug>/p` NO estan bloqueadas. `policy.json` ahora usa ese robots.txt (host cambiado).
- robots.txt (revisado hoy): bloquea `/account/*`, `/login/*`, `/checkout/*`, `/busca/*`, `/quick-view/*`, `/espiar/*`, `/buscapagina/*` y varios parametros de busqueda.
- Terminos (cambio de host): `policy.json` ahora apunta a `https://www.d1.com.co/` y ya no a `domicilios.tiendasd1.com`. Las URLs probadas en el host viejo (`/terminos-y-condiciones`) daban 404 y el pie de pagina se carga con JavaScript; no se pudo leer ningun texto legal.
- Decision: **No**. No se pudieron leer los terminos. ~~(Superada por la decision del dueno del 2026-11-04: D1 se lee bajo las precauciones.)~~

## Ara (aratiendas.com)
- robots.txt: bloquea `/wp-admin/` y varias rutas `/productos_*`.
- Terminos (https://aratiendas.com/terminos-y-condiciones/), seccion "Usos no permitidos": "Utilizar spiders, site copiers o cualquier otro dispositivo, programa, algoritmo o metodo para acceder, adquirir, copiar o monitorear cualquier parte o Contenido de las Paginas Webs bajo Jeronimo Martins (Tiendas ara...)". Tambien: "Queda prohibido todo acto de copia, reproduccion... sin el permiso previo por escrito".
- Su catalogo publico parece ser solo volante de promocion, no precios regulares.
- Decision: **No**. Prohibicion explicita.

## Exito (exito.com)
- robots.txt: bloquea `/account/`, `/login`, `/checkout/`, `/s?` (busqueda), `/api/` y `/coleccion/`. Las paginas de producto no estan bloqueadas.
- Terminos (https://www.exito.com/terminos-condiciones): no hay clausula explicita sobre scraping. Dicen que el Vendedor puede prohibir el acceso a quien viole los terminos y que imagenes, marcas y demas elementos son propiedad intelectual.
- Problemas: la via practica para leer precios (API de busqueda) esta bloqueada por robots; el sitio respondio "429 Too Many Requests" al agente del robot en dos intentos; no se pudo comprobar como se elige Bucaramanga leyendo solo paginas permitidas.
- Decision: **No** (por ahora). ~~(Superada por la decision del dueno del 2026-11-04: Exito se lee bajo las precauciones.)~~ Se puede revisar de nuevo si se confirma una via permitida con cobertura de Bucaramanga.

## Carulla (carulla.com)
- robots.txt y plataforma identicos a Exito (mismo grupo). Terminos en https://www.carulla.com/terminos-condiciones, sin clausula explicita de scraping.
- Mismos problemas que Exito (API bloqueada, 429, Bucaramanga sin verificar).
- 2026-11-04 (mapeo del paso 4): robots.txt respondio 200; la siguiente peticion (el sitemap que robots.txt lista, 8.7 s despues) respondio **429** con las cabeceras `rate-limit-reason: bot` y `rate-limit-threshold: 166` (Cloudflare delante de `faststore-prod`). El limite es por **identificarse como robot** (el user agent dice "Bot"), no por velocidad. Se paro la tienda sin reintentar. Exito no se toco (misma plataforma, ya habia dado 429 dos veces). Sin cambiar el user agent (no permitido) no se pueden leer ni el sitemap ni las paginas de producto; queda para decision del dueno.
- Decision: **No** (por ahora). ~~(Superada por la decision del dueno del 2026-11-04: Carulla se lee bajo las precauciones.)~~

## Jumbo (tiendasjumbo.co, redirige a jumbocolombia.com)
- robots.txt: bloquea `/Account*`, `/busca*`, `/checkout/`, `/login*`, `/cart` y parametros como `?ciudad`, `?map`, `?page`.
- Terminos (https://www.jumbocolombia.com/terminos-y-condiciones): la pagina carga con JavaScript y no devolvio texto legible ni con curl ni con una lectura web.
- Decision: **No**. No se pudieron leer los terminos. ~~(Superada por la decision del dueno del 2026-11-04: Jumbo se lee bajo las precauciones.)~~

## Que cambio despues
- Ara (tarea 12 original) no se lee. En su lugar, los precios de referencia de Bucaramanga vienen del DANE (SIPSA, mayoristas) y se muestran como "Aproximado"; los precios de Ara llegaran con los reportes de usuarios (plan 5).
- El campo `method` de `policy.json` dice lo que cada lector realmente lee de la pagina de producto: Exito y Carulla usan `next_data` (el JSON `__NEXT_DATA__`, via `extractFastStoreProduct`); Jumbo y D1 usan `vtex_io_state` (el `__STATE__` de VTEX IO, via `extractVtexIoProduct`). Ninguna usa ya `jsonld_html`.

## Pendiente
- Revision legal antes del lanzamiento publico (recomendada al dueno, pendiente).
- Confirmar como se elige Bucaramanga en cada tienda (en cada modulo).
