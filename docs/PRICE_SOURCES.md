# Fuentes de precios: revision legal de las 5 tiendas (Bucaramanga)

Fecha de la revision: 2026-11-04.

> Aviso: es una revision razonada hecha por el equipo, **no es asesoria legal**. Falta el visto bueno del dueno del proyecto (pendiente). Regla aplicada: ante la duda, no se lee la tienda.

El robot se identifica como `FitMarketPriceBot/1.0 (+https://fitmarket-ai.vercel.app)` (URL del proyecto, no un correo personal). El archivo `scripts/prices/policy.json` es la version para maquinas de este documento; el lector de precios solo usa tiendas con `allowed: true`. El texto `bucaramanga.how` es solo documentacion: el codigo nunca lo interpreta.

## Resumen

| Tienda | Se puede leer | Motivo corto |
|---|---|---|
| D1 | No | Terminos no legibles; robots bloquea /busca/* |
| Ara | No | Terminos prohiben spiders y copia automatica |
| Exito | No | robots bloquea /api/ y /s?; 429; Bucaramanga sin verificar |
| Carulla | No | Igual que Exito (misma plataforma) |
| Jumbo | No | Terminos no legibles; robots bloquea /busca* y ?ciudad |

Consecuencia: hoy ninguna tienda esta autorizada. Las tareas que leen precios reales no deben leer ninguna tienda hasta que el dueno decida (por ejemplo, pidiendo permiso por escrito a una tienda o usando una fuente oficial o un acuerdo).

## D1 (domicilios.tiendasd1.com / d1.com.co)
- robots.txt (revisado hoy): bloquea `/account/*`, `/login/*`, `/checkout/*`, `/busca/*`, `/quick-view/*`, `/espiar/*`, `/buscapagina/*` y varios parametros de busqueda.
- Terminos: las URLs probadas (`/terminos-y-condiciones`) dan 404 y el pie de pagina se carga con JavaScript; no se pudo leer ningun texto legal.
- Decision: **No**. No se pudieron leer los terminos.

## Ara (aratiendas.com)
- robots.txt: bloquea `/wp-admin/` y varias rutas `/productos_*`.
- Terminos (https://aratiendas.com/terminos-y-condiciones/), seccion "Usos no permitidos": "Utilizar spiders, site copiers o cualquier otro dispositivo, programa, algoritmo o metodo para acceder, adquirir, copiar o monitorear cualquier parte o Contenido de las Paginas Webs bajo Jeronimo Martins (Tiendas ara...)". Tambien: "Queda prohibido todo acto de copia, reproduccion... sin el permiso previo por escrito".
- Su catalogo publico parece ser solo volante de promocion, no precios regulares.
- Decision: **No**. Prohibicion explicita.

## Exito (exito.com)
- robots.txt: bloquea `/account/`, `/login`, `/checkout/`, `/s?` (busqueda), `/api/` y `/coleccion/`. Las paginas de producto no estan bloqueadas.
- Terminos (https://www.exito.com/terminos-condiciones): no hay clausula explicita sobre scraping. Dicen que el Vendedor puede prohibir el acceso a quien viole los terminos y que imagenes, marcas y demas elementos son propiedad intelectual.
- Problemas: la via practica para leer precios (API de busqueda) esta bloqueada por robots; el sitio respondio "429 Too Many Requests" al agente del robot en dos intentos; no se pudo comprobar como se elige Bucaramanga leyendo solo paginas permitidas.
- Decision: **No** (por ahora). Se puede revisar de nuevo si se confirma una via permitida con cobertura de Bucaramanga.

## Carulla (carulla.com)
- robots.txt y plataforma identicos a Exito (mismo grupo). Terminos en https://www.carulla.com/terminos-condiciones, sin clausula explicita de scraping.
- Mismos problemas que Exito (API bloqueada, 429, Bucaramanga sin verificar).
- Decision: **No** (por ahora).

## Jumbo (tiendasjumbo.co, redirige a jumbocolombia.com)
- robots.txt: bloquea `/Account*`, `/busca*`, `/checkout/`, `/login*`, `/cart` y parametros como `?ciudad`, `?map`, `?page`.
- Terminos (https://www.jumbocolombia.com/terminos-y-condiciones): la pagina carga con JavaScript y no devolvio texto legible ni con curl ni con una lectura web.
- Decision: **No**. No se pudieron leer los terminos.

## Pendiente del dueno
- Dar el visto bueno (u objetar) a esta revision.
- Decidir como obtener precios sin leer las tiendas: permiso escrito, fuente oficial de datos, o aportes manuales.
- Opcional: cambiar la URL de contacto del robot si prefiere otra.
