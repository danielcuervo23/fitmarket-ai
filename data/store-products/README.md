# Store product mappings

One file per store: `data/store-products/<StoreId>.json` where `<StoreId>` is
`Exito`, `Carulla`, `Jumbo` or `D1`. A store without a file is skipped. `Ara`
is never read (`allowed: false` in `scripts/prices/policy.json`).

Each file is an array of entries:

```json
[
  {
    "foodId": "arroz_blanco",
    "externalId": "123456",
    "name": "Arroz Diana 500 g",
    "packSize": 500,
    "url": "https://www.exito.com/arroz-diana-500-g-123456/p"
  }
]
```

| Field | Rule |
| --- | --- |
| `foodId` | Must exist in `data/foods/foods.json`. |
| `externalId` | The store's own product id. Unique inside the file, 1-120 characters. |
| `name` | 1-200 characters. |
| `packSize` | More than 0. Content of ONE pack in the food's base unit (g, ml or unit). The reader compares it with the size on the page and rejects a mismatch (avoids per-kg vs per-pack mix-ups). |
| `url` | `https://`, on the store host from `policy.json` (`robotsUrl`), and a product page that matches `productPathPattern` (`/<slug>/p`). |

Unknown fields are rejected. The loader (`scripts/prices/mappings.ts`) lists
every invalid entry by index and stops the run before any request is made.
Only the regular price and the pack size are stored; never images, descriptions
or logos.
