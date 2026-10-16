# Catálogo de cartas Pokémon (singles)

Catálogo estático y gratuito con precios en COP. Sin servidor, sin base de datos, sin dependencias npm (solo Node 22).

## Agregar una carta

1. Busca la carta en <https://pokemontcg.io> (o en la API). El id aparece en la URL de la carta, por ejemplo `sv3pt5-25` (expansión `sv3pt5`, número `25`).
2. Agrégala a `singles.json`:

```json
{ "id": "sv3pt5-25", "qty": 2, "variant": "reverseHolofoil", "condition": "NM" }
```

Solo `id` y `qty` son obligatorios. `variant` es la clave de precio de TCGPlayer (`normal`, `holofoil`, `reverseHolofoil`, `1stEditionHolofoil`, ...); si falta, se usa la primera disponible.

## Precio manual

Agrega `"price": 50000` (entero en COP). Ese valor reemplaza el precio calculado.

## Actualizar precios

```sh
npm run prices   # genera catalog.json
npm test         # pruebas de la regla de precios
```

Opcional: exporta `POKEMONTCG_API_KEY` para tener más cuota en la API.

La tasa USD→COP es fija y la editas tú en `config.json` (`usdToCop`). Después de cambiarla, corre `npm run prices`.

GitHub Actions corre esto cada lunes (12:00 UTC) y hace commit de `catalog.json` si cambió. También se puede lanzar a mano desde la pestaña Actions. La clave de API va en Settings → Secrets → `POKEMONTCG_API_KEY` (opcional).

## Ver la página localmente

```sh
python3 -m http.server 8000
```

Abre <http://localhost:8000>.

## Publicar gratis en GitHub Pages

Settings → Pages → Deploy from a branch → `main` / `(root)`.

## Regla de precio

`precio = max(minPriceCop, redondear_hacia_arriba(usd × tasa × margin, roundToCop))`

- `usd`: precio `market` de TCGPlayer (o `mid` si no hay `market`).
- Sin precio en TCGPlayer → `minPriceCop`.
- Se cambia en `config.json`: `minPriceCop` (mínimo, 2000), `margin` (1.0 = sin margen; 1.2 = +20 %), `roundToCop` (500).

## ¿Por qué no Collectr?

Collectr no tiene API pública, así que los precios salen de pokemontcg.io, que expone los precios de TCGPlayer gratis.
