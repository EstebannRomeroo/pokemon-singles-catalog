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

Obligatorios: `game`, `group`, `product` y `qty` (enteros positivos). `variant` es el `subTypeName` de TCGPlayer (`Normal`, `Holofoil`, `Reverse Holofoil`, `Foil`, `1st Edition Holofoil`, ...); si falta o no tiene precio, se usa la primera con precio en este orden: `Normal`, `Holofoil`, `Reverse Holofoil`, `Foil`, luego cualquier otra. `condition` es `NM` por defecto. `language` es el idioma impreso de la carta (`EN` por defecto; también `ES`, `JP`, `PT`, `FR`, `DE`, `IT`) y se muestra como etiqueta; el precio de referencia de TCGPlayer siempre es el de la versión en inglés. No se puede repetir la misma combinación de `game`, `product` y `variant`.

## Precio manual

Agrega `"price": 50000` (número entero positivo en COP, sin comillas). Ese valor reemplaza el precio calculado. `null` o sin `price` = precio calculado.

## Actualizar precios

```sh
npm run prices   # genera catalog.json
npm test         # pruebas de la regla de precios
```

Los datos salen de [TCGCSV](https://tcgcsv.com): un volcado diario, gratuito y sin clave de los productos y precios de TCGPlayer. Es un proyecto comunitario no oficial (no es de TCGPlayer), así que puede cambiar o dejar de funcionar. El script descarga una vez la lista de grupos por juego y, por cada grupo usado, sus productos y precios.

Cada carta de `catalog.json` incluye `details`: los datos de TCGPlayer (`extendedData`: HP, ataques, texto de la carta, etc.) como pares `{ label, value }` en texto plano, sin HTML; el visor de la carta los muestra.

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
npm run serve
```

Abre <http://localhost:8000>.

Es un servidor Node sin dependencias (`scripts/serve.mjs`). Además de servir los archivos, hace de **proxy hacia tcgcsv.com** en `/tcgplayer/...`, porque tcgcsv.com no manda cabeceras CORS y el navegador no puede llamarlo directo. El panel solo habla con `localhost`, así que nunca hay CORS de por medio.

El proxy acepta únicamente las rutas que el proyecto usa (`/tcgplayer/{cat}/groups`, `/tcgplayer/{cat}/{group}/products`, `/tcgplayer/{cat}/{group}/prices`, `/last-updated.txt`) y rechaza cualquier ruta con query string. No es un proxy abierto.

## Panel de inventario (local)

`admin.html` es una página local para manejar `singles.json` sin editar JSON a mano: ver el inventario, agregar una carta, quitar una y marcar vendida. **No está publicada y no se enlaza desde el catálogo** (`noindex`); solo existe cuando sirves la carpeta localmente.

```sh
npm run serve
```

Abre <http://localhost:8000/admin.html>.

### Agregar una carta

No necesitas averiguar ids de TCGCSV. Solo:

1. Elige el **juego**.
2. Elige el **set** en el selector (escríbelo en el filtro por nombre o abreviatura, por ejemplo `Perfect Order` o `POR`).
3. Escribe el **número impreso** en la carta: `083`, `83` o `083/088` dan el mismo resultado.
4. Pulsa **Buscar**. El panel muestra el nombre real, el set, el número y el **precio de TCGCSV en COP**.
   - Si varios productos comparten el número (impresiones distintas), aparecen como opciones para elegir.
   - Si el número no está en ese set, lo dice.
5. Pulsa **Agregar**.

El precio que ves al agregar usa la misma conversión que `npm run prices` (`pickPrice` y `toCop`), así que coincide con el publicado.

El flujo de publicación es:

1. Haz tus cambios en el panel (agregar, quitar, vender).
2. Pulsa **Exportar singles.json**: el navegador descarga el archivo actualizado.
La **bandeja de revisión** aparece debajo del formulario cuando añades cartas con "Añadir a la bandeja". Sirve para verificar antes de agregar:

1. Buscas la carta (set + número) y pulsas **Añadir a la bandeja**.
2. La carta aparece en la bandeja **con su imagen**, para confirmar que es la correcta.
3. Quitas las que no eran con la **✕**, o vacías la bandeja completa.
4. Cuando terminaste de revisar, pulsas **Agregar al inventario** y entran todas juntas.

Nada se agrega hasta el paso 4: la bandeja es una zona de espera, no parte del inventario. El botón **Agregar** directo sigue funcionando si ya estás seguro y no quieres revisar.

Si una carta que pones en la bandeja **ya está en tu inventario**, el panel te avisa y al confirmar le suma una copia en vez de duplicar la fila.

3. Reemplaza `singles.json` en el repositorio con el descargado.
4. Corre **`npm run deploy`**: regenera `catalog.json`, te muestra qué va a publicar, pide confirmación y hace commit + push.

### Publicar con `npm run deploy`

Ese comando junta los últimos tres pasos (regenerar, commitear, subir) y **no publica nada sin tu confirmación**:

```
$ npm run deploy

  singles.json : 24 entradas
  catalog.json : 24 items

  Cambios a publicar:
    M catalog.json
    M singles.json

  ¿Publicar en main? (s/n)
```

Escribes `s` y publica; escribes `n` y no toca nada. Si falla al regenerar el catálogo, se detiene sin publicar. Nunca hace `push --force` y solo funciona en `main`.

Ojo con el paso que se olvida: `npm run prices` regenera el catálogo **en tu máquina**, pero GitHub Pages sirve lo que está **en GitHub**. Sin el push, el sitio público nunca se entera. `npm run deploy` hace las dos cosas.

Detalles:

- **Vender** baja `qty` en uno; cuando llega a cero, la entrada se elimina del inventario.
- **Quitar** borra la entrada completa (pide confirmación).
- El panel valida con las mismas reglas que `singles.json`: juego válido, enteros positivos, idioma permitido y sin repetir `game` + `product` + `variant`. Si algo está mal, no deja exportar y muestra el error.
- El panel **no escribe nada por su cuenta**: no toca el repositorio, no usa la API de GitHub y no necesita token. La única escritura es el archivo que tú descargas y colocas a mano.
- Debe abrirse por HTTP (no `file://`): el navegador bloquea los módulos ES y `fetch` en `file://`. Si lo abres mal, la página te lo indica.
- Si el proxy no responde, el panel lo dice y sugiere `npm run serve` en vez de quedarse en silencio.

## Publicar gratis en GitHub Pages

Settings → Pages → Deploy from a branch → `main` / `(root)`.

## Regla de precio

`precio = max(minPriceCop, redondear_hacia_arriba(usd × tasa × margin, roundToCop))`

- `usd`: `marketPrice` de TCGPlayer (o `midPrice` si no hay `marketPrice`).
- Sin precio en TCGPlayer en ninguna variante → error; agrega un precio manual.
- Se cambia en `config.json`: `minPriceCop` (mínimo, 2000), `margin` (1.0 = sin margen; 1.2 = +20 %), `roundToCop` (500).

## ¿Por qué no Collectr ni pokemontcg.io?

Collectr no tiene API pública. pokemontcg.io está deprecada (sin claves nuevas) y no trae precios de expansiones nuevas; además solo cubre Pokémon. TCGCSV cubre Pokémon, Magic y One Piece con los mismos datos de TCGPlayer.
