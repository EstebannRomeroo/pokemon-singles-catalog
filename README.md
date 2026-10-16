# Catálogo de cartas TCG (singles)

Catálogo estático y gratuito de cartas Pokémon, Magic y One Piece con precios en COP. Sin servidor, sin base de datos, sin dependencias npm (solo Node 22).

## Agregar una carta

Cada carta se identifica por el juego, el id del grupo (expansión) y el id del producto de TCGPlayer:

| `game`     | Juego      | Categoría TCGPlayer |
| ---------- | ---------- | ------------------- |
| `pokemon`  | Pokémon    | 3                   |
| `magic`    | Magic      | 1                   |
| `onepiece` | One Piece  | 68                  |

1. Busca la carta en <https://www.tcgplayer.com>. El `product` es el número de la URL: `https://www.tcgplayer.com/product/633030/...` → `633030`.
2. Busca el `group` (expansión) en la lista de grupos de su categoría: `https://tcgcsv.com/tcgplayer/{categoría}/groups` (por ejemplo <https://tcgcsv.com/tcgplayer/3/groups> para Pokémon). Cada grupo tiene `groupId` y `name`. Para confirmar, el producto debe aparecer en `https://tcgcsv.com/tcgplayer/{categoría}/{group}/products`.
3. Agrégala a `singles.json`:

```json
[
  { "game": "pokemon", "group": 24269, "product": 633030, "qty": 1, "condition": "NM" },
  { "game": "magic", "group": 24766, "product": 706132, "qty": 2, "variant": "Foil" },
  { "game": "onepiece", "group": 24637, "product": 685008, "qty": 3, "price": 5000 }
]
```

Ejemplos reales: Ethan's Ho-Oh ex (SV10: Destined Rivals), Brad Boimler, Eager Ensign (Magic: Star Trek) en foil y Enel (SP) EB02-052 (One Piece: Adventure on Kami's Island) con precio manual.

Obligatorios: `game`, `group`, `product` y `qty` (enteros positivos). `variant` es el `subTypeName` de TCGPlayer (`Normal`, `Holofoil`, `Reverse Holofoil`, `Foil`, `1st Edition Holofoil`, ...); si falta o no tiene precio, se usa la primera con precio en este orden: `Normal`, `Holofoil`, `Reverse Holofoil`, `Foil`, luego cualquier otra. `condition` es `NM` por defecto. No se puede repetir la misma combinación de `game`, `product` y `variant`.

## Precio manual

Agrega `"price": 50000` (número entero positivo en COP, sin comillas). Ese valor reemplaza el precio calculado. `null` o sin `price` = precio calculado.

## Actualizar precios

```sh
npm run prices   # genera catalog.json
npm test         # pruebas de la regla de precios
```

Los datos salen de [TCGCSV](https://tcgcsv.com): un volcado diario, gratuito y sin clave de los productos y precios de TCGPlayer. Es un proyecto comunitario no oficial (no es de TCGPlayer), así que puede cambiar o dejar de funcionar. El script descarga una vez la lista de grupos por juego y, por cada grupo usado, sus productos y precios.

La tasa USD→COP es fija y la editas tú en `config.json` (`usdToCop`). Después de cambiarla, corre `npm run prices`.

GitHub Actions corre esto cada lunes (12:00 UTC) y hace commit de `catalog.json` si cambió (si los precios y la tasa son iguales, el archivo no se toca y se imprime `catalog.json unchanged`). También se puede lanzar a mano desde la pestaña Actions.

### Errores (no se publica nada)

Si hay un problema, el script lista todos los errores, termina con código 1 y no modifica `catalog.json`, así que la tarea semanal no publica datos malos:

```text
error: 2 problem(s), catalog.json left untouched:
  - card pokemon/999999 not found on tcgcsv.com
  - card magic/123456: price must be a positive integer in COP (got "50000")
```

Otros mensajes: `config.json margin must be a positive number (got ...)`, `singles.json entry 0: game must be one of pokemon, magic, onepiece`, `card pokemon/633030: qty must be a positive integer`, `card pokemon/633030: duplicate entry in singles.json`, `card X has no TCGPlayer price; set a manual "price"`. Si el `group` no corresponde al producto, la carta aparece como `not found`.

## Ver la página localmente

```sh
python3 -m http.server 8000
```

Abre <http://localhost:8000>.

## Publicar gratis en GitHub Pages

Settings → Pages → Deploy from a branch → `main` / `(root)`.

## Regla de precio

`precio = max(minPriceCop, redondear_hacia_arriba(usd × tasa × margin, roundToCop))`

- `usd`: `marketPrice` de TCGPlayer (o `midPrice` si no hay `marketPrice`).
- Sin precio en TCGPlayer en ninguna variante → error; agrega un precio manual.
- Se cambia en `config.json`: `minPriceCop` (mínimo, 2000), `margin` (1.0 = sin margen; 1.2 = +20 %), `roundToCop` (500).

## ¿Por qué no Collectr ni pokemontcg.io?

Collectr no tiene API pública. pokemontcg.io está deprecada (sin claves nuevas) y no trae precios de expansiones nuevas; además solo cubre Pokémon. TCGCSV cubre Pokémon, Magic y One Piece con los mismos datos de TCGPlayer.
