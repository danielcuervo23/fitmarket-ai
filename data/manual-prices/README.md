# Precios anotados a mano (audit trail)

Cada archivo de esta carpeta es un `precios-<tienda>-<AAAA-MM-DD>.json` exportado
con el marcador **"Anotar precio"** (`tools/anotador/index.html`): una persona
abrió la página pública de cada producto en Chrome, con Bucaramanga elegida en la
propia tienda, y el marcador leyó el precio normal y el tamaño **de la página que
esa persona estaba viendo**. No hay robot ni peticiones ocultas a la tienda.

Los archivos se guardan (commit) y no se editan a mano: son el registro de qué se
vio, dónde y cuándo.

## Formato

```json
{
  "schemaVersion": 1,
  "store": "Carulla",
  "city": "bucaramanga",
  "capturedOn": "2026-11-04",
  "cityAttested": true,
  "entries": [
    {
      "foodId": "arroz_blanco",
      "externalId": "445117",
      "name": "Arroz DIANA blanco vitamor (500 gr)",
      "packSize": 500,
      "url": "https://www.carulla.com/arroz-diana-500-gr-479512/p",
      "regularPriceCop": 2500,
      "observedOn": "2026-11-04"
    }
  ]
}
```

Nunca imágenes, descripciones ni logos. `cityAttested: true` = la persona marcó
"Tengo Bucaramanga seleccionada en esta tienda".

## Importar

```sh
npm run prices:import -- data/manual-prices/precios-carulla-2026-11-04.json            # dry run: no cambia nada
npm run prices:import -- --mappings-only data/manual-prices/precios-carulla-*.json     # actualiza data/store-products/<Tienda>.json
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  npm run prices:import -- --write data/manual-prices/precios-carulla-*.json           # mapeos + precios (source 'official')
```

El importador (`scripts/prices/manual/import.ts`) rechaza el lote entero si algo
no cuadra: esquema estricto, tienda permitida en `policy.json`, URL de producto
canónica en el dominio de la tienda, alimento conocido, tamaño razonable para ese
alimento, precio entre 50 y 5.000.000 COP, fecha no futura y de máximo 45 días,
`cityAttested: true`. Al escribir usa el mismo control de saltos (x0,5 .. x2 del
último precio oficial) que el trabajo semanal. Volver a importar el mismo archivo
no duplica nada (la base tiene `unique (store_product_id, city, source, observed_on)`).

El workflow manual `.github/workflows/prices-manual.yml` importa todos los
archivos de esta carpeta (los de más de 45 días se saltan).
