# Catálogo de cartas Pokémon (singles)

Catálogo estático y gratuito con precios en COP. Sin servidor, sin base de datos, sin dependencias npm (solo Node 22).

## Agregar una carta

1. Busca la carta en <https://pokemontcg.io> (o en la API). El id aparece en la URL de la carta, por ejemplo `sv3pt5-25` (expansión `sv3pt5`, número `25`).
2. Agrégala a `singles.json`:

```json
{ "id": "sv3pt5-25", "qty": 2, "variant": "reverseHolofoil", "condition": "NM" }
```

Solo `id` y `qty` son obligatorios. `variant` es la clave de precio de TCGPlayer (`normal`, `holofoil`, `reverseHolofoil`, `1stEditionHolofoil`, ...); si falta o no tiene precio, se usa la primera con precio en este orden: `normal`, `holofoil`, `reverseHolofoil`, luego cualquier otra.

## Precio manual

Agrega `"price": 50000` (número entero positivo en COP, sin comillas). Ese valor reemplaza el precio calculado. `null` o sin `price` = precio calculado.

## Actualizar precios

```sh
npm run prices   # genera catalog.json
npm test         # pruebas de la regla de precios
```

pokemontcg.io está deprecada: ya no emite claves nuevas y las existentes funcionan hasta el 1 de marzo de 2027. La API responde sin clave; si tienes una, expórtala como `POKEMONTCG_API_KEY`. Alternativa de pago si deja de funcionar: [Scrydex](https://scrydex.com/).

La tasa USD→COP es fija y la editas tú en `config.json` (`usdToCop`). Después de cambiarla, corre `npm run prices`.

GitHub Actions corre esto cada lunes (12:00 UTC) y hace commit de `catalog.json` si cambió (si los precios y la tasa son iguales, el archivo no se toca y se imprime `catalog.json unchanged`). También se puede lanzar a mano desde la pestaña Actions.

### Errores (no se publica nada)

Si hay un problema, el script lista todos los errores, termina con código 1 y no modifica `catalog.json`, así que la tarea semanal no publica datos malos:

```text
error: 2 problem(s), catalog.json left untouched:
  - card zz-999 not found on pokemontcg.io
  - card base1-4: price must be a positive integer in COP (got "50000")
```

Otros mensajes: `config.json margin must be a positive number (got ...)`, `card sv1-25: qty must be a positive integer`, `card sv1-25: duplicate id in singles.json`, `card X has no TCGPlayer price; set a manual "price"`.

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
- Sin precio en TCGPlayer en ninguna variante → error; agrega un precio manual.
- Se cambia en `config.json`: `minPriceCop` (mínimo, 2000), `margin` (1.0 = sin margen; 1.2 = +20 %), `roundToCop` (500).

## ¿Por qué no Collectr?

Collectr no tiene API pública, así que los precios salen de pokemontcg.io, que expone los precios de TCGPlayer gratis.
