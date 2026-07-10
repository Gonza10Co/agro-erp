# tools/

Utilidades de carga de datos maestros. No son parte del build ni del runtime: se corren a
mano cuando el cliente entrega un archivo nuevo.

## generar-despiece.py

Convierte la hoja `CONSUMOSXREFERENCIA` del Excel **CONTROL_PRODUCCIÓN_AGROINDUSTRIAL** en
los CSV que consume `seed-basarili.ts`.

```bash
pip install openpyxl
python tools/generar-despiece.py /ruta/CONTROL_PRODUCCIÓN_AGROINDUSTRIAL.xlsx

# luego, contra la BD:
npm run seed:piezas   --workspace backend   # el catálogo de piezas debe existir antes
npm run seed:basarili --workspace backend
```

**El color de las celdas es un dato.** El cliente (Juan Pablo, 2026-07-09) confirmó que en esa
hoja las celdas **sombreadas en gris** tienen prueba industrial hecha y su consumo es real; las
**blancas** traen valores que no lo son. El script carga solo las grises y pone en **cero** las
blancas, a la espera de que terminen el ejercicio. Sin esa regla, un mismo valor de relleno
(`0.097`) se sembraría como consumo verdadero en materiales sin relación entre sí.

Qué escribe (dentro de `backend/prisma/data/basarili/`, fuera de control de versiones):

- `bom-curva.csv` — `referencia,material,pieza,talla,consumo`. Una línea por (material, pieza)
  y talla. La pieza vacía significa "bota completa, sin despiezar".
- `bom-fijo.csv` — reescrito **sin** los materiales que ahora vienen despiezados, o la receta
  tendría el mismo material dos veces (una plana y otra por pieza). El original queda en
  `bom-fijo.csv.pre-despiece` y el script siempre lee de ahí, así que es idempotente.

Además avisa de:

- **materiales sin mapeo** — hay que agregarlos a la tabla `MATERIALES` del script;
- **colisiones de (material, pieza)** — dos nombres distintos de la hoja que caen en el mismo
  código y la misma pieza. Gana el que tenga prueba industrial. Si algún día chocan **dos
  validados**, el catálogo de materiales necesita desambiguarse (hoy pasa con el contrafuerte
  normal y el `S/P`, que comparten `PCON44`).

Pendiente de confirmar con el cliente antes de ampliar el alcance: la referencia **106** y las
variantes **ECONOMICA** (que no son piezas, sino una versión más barata de la misma bota), hoy
excluidas por `REFS_EXCLUIDAS` y `PREFIJOS_EXCLUIDOS`.
