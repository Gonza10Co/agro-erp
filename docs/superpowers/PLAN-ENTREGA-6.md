# PLAN — Entrega 6 (quincena del 2026-07-30 → ~08-13)

> Radiografía hecha contra el código real el 2026-07-30. Estimaciones en días de trabajo
> full-time de una persona. **Presupuesto neto: ~8,5 días** (10 hábiles − 1 de merge/deploy/
> seed/E2E/presentación − 0,5 de liberar gates el día de la demo).
>
> ⚠️ La demo de la Entrega 5 se corrió al **martes 2026-08-04** (JP, nota de voz del 30-jul:
> cierre de mes). Esta quincena arranca antes de esa demo.

## Alcance acordado

| Día | Bloque | Commit |
|---|---|---|
| 1 – 3,5 | **Consumo real de MP por OF** (registro manual del almacenista) | `feat(inventario): consumo real de materiales por OF` |
| 3,5 – 5,5 | **Sub-procesos de INYECCIÓN** (montaje · inyección · finizaje · impacto) | `feat(fabricacion): sub-pasos de inyección` |
| 5,5 – 7,5 | **Meta diaria + calendario de días hábiles** | `feat(reportes): cumplimiento diario contra días hábiles` |
| 7,5 – 8,5 | Merge, deploy, seeds, E2E vivo, presentación, gates | |

**Fuera, explícitamente: la cuenta de cobro de materiales de Feroz a costo de importación.**
Está **bloqueada por dato**: JP dijo el 30-jul que iba a pasar "una ficha de consumos con el valor
del costo al que sale cada producto" y todavía no llegó. `Material` hoy tiene `costoBase` y
`costoPromedio` (`schema.prisma:104-105`), ninguno es el costo de importación. Si la ficha llega
antes del día 5, se evalúa meterla en lugar del bloque de metas.

**Orden: consumo PRIMERO.** Es el más grande y el único con riesgo de diseño; los otros dos son
patrones que el repo ya tiene resueltos. Sub-procesos va segundo porque el reporte diario cuenta
producción por célula y hay que decidir **qué sub-paso marca "inyectado"** antes de tocar metas.

## Impacto en la demo

| Tema | Impacto | Por qué |
|---|---|---|
| **Consumo real por OF** | 🟢 el más alto | cierra el ciclo del material: hoy el sistema **reserva** insumos pero nunca los descuenta de verdad. Es la trazabilidad que el cliente compró |
| **Meta diaria** | 🟢 alto | JP la pidió textualmente ("metas mensuales con seguimiento diario"); hoy el % solo se ve contra el mes cerrado |
| **Sub-procesos inyección** | 🟡 medio | corrige el modelo con lo que dijo JP el 30-jul, pero se ve solo en el piso de planta |

---

## 1) Consumo real de MP por OF — 3,5 días

**El hueco exacto:** `MotivoMovimiento.CONSUMO_PRODUCCION` existe en el enum
(`schema.prisma:1100`) y está clasificado como SALIDA en `inventario-core.ts:15`, pero
**ningún servicio lo emite**. Hoy el ciclo del material se corta a la mitad:

```
  OP confirmada ──► reserva (InventarioMaterial.cantReservada)  ✅ existe
                    + requerimiento de compra automático        ✅ existe
                             │
                             ▼
                    entrega física al operario                  ❌ NO EXISTE
                    consumo real vs teórico                     ❌ NO EXISTE
                             │
                             ▼
  OP despachada ──► liberarReservasDeOp()                       ✅ existe
```

O sea: la reserva se libera al despachar **como si nunca se hubiera gastado nada**. El stock de
MP solo baja por devolución a proveedor o ajuste manual.

**Decisión de negocio ya cerrada (JP, 2026-07-29):** el almacenista **registra a mano lo que
entregó**. NO hay backflush (descontar automático contra el BOM al avanzar pares). Esto es lo que
destraba la Fase B y ahorra el trabajo más grande.

**Diseño:**
- Modelo nuevo `ConsumoOf` (materialId, ofId, cantidad, costoUnitario, usuarioId, createdAt) o
  reusar `MovimientoInventario` con `referencia = "OF-31"`. **Preferir el movimiento solo**: el
  kardex ya es la fuente única y agregar una tabla paralela duplica la verdad. Lo que sí hace
  falta es `MovimientoInventario.ofId` (FK opcional) para poder agrupar por OF sin parsear el
  string de `referencia`.
- Endpoint `POST /fabricacion/of/:id/consumo` con `{ lineas: [{materialId, cantidad}] }`, en
  una transacción: baja `InventarioMaterial.cantidad`, descuenta `cantReservada` de la OP dueña
  (hasta donde alcance, sin dejarla negativa), escribe el movimiento valorizado a
  `costoPromedio` y devuelve el consolidado teórico-vs-real de la OF.
- `GET /fabricacion/of/:id/consumo` devuelve, por material: **teórico** (BOM resuelto × pares de
  la OF, que ya sabe calcular `requerimiento-calculo.ts`), **entregado** y **diferencia**. Esa
  tabla es la pantalla del almacenista y es también el insumo del costeo real por OF.
- Lógica pura en `consumo-of-core.ts` (cálculo teórico-vs-real y reparto contra la reserva),
  service delgado encima. Specs primero.

**Riesgos:**
- ⚠️ **Doble descuento**: si el almacenista registra dos veces la misma entrega, el stock baja
  dos veces. El registro es acumulativo por diseño (varias entregas por OF a lo largo de los
  días), así que **no** se puede hacer idempotente por (of, material). Mitigación: la pantalla
  muestra lo ya entregado antes de aceptar más, y el movimiento queda con usuario y hora.
- ⚠️ **Reserva vs consumo**: hoy `liberarReservasDeOp` devuelve al disponible **todo** lo
  amarrado. Si ya se consumió parte, liberar el total infla el stock. Hay que restar lo
  consumido antes de liberar — es el punto donde este bloque toca código que ya está en prod y
  el que más spec necesita.
- El stock de MP en prod es real (viene de los inventarios del cliente): un bug acá le mueve
  cifras que él conoce de memoria.

## 2) Sub-procesos de INYECCIÓN — 2 días

**Dato nuevo (JP, nota de voz del 2026-07-30):** *"finizaje no es una célula aparte, el proceso
de inyección lleva montaje, lleva inyección como tal, lleva finizaje y lleva el impacto"*.

Hoy `enum Celula` (`schema.prisma:823`) trata INYECCION como una sola estación. **El patrón ya
existe y está probado**: `SubPasoGuarnicion` (AREA…AMARRE) + `Par.subPasoActual`, con el detalle
de que en Guarnición el reporte cuenta como producido **solo el sub-paso AMARRE**
(`reporte-diario-core.ts:149`).

**Diseño:** replicar el patrón — `enum SubPasoInyeccion { MONTAJE, INYECCION, FINIZAJE, IMPACTO }`,
campo `Par.subPasoInyeccion` (nullable, solo poblado mientras `celulaActual = INYECCION`) y el
avance dentro de la célula en `fabricacion-core.ts`, que ya sabe hacer forward-only.

⚠️ **Decidir con el cliente antes de codear:** ¿qué sub-paso marca el par como "inyectado" para
el reporte y la meta de INYECCION? Por simetría con Guarnición debería ser **el último (IMPACTO)**,
pero si el dueño cuenta la inyección en la máquina, el número le va a dar distinto al de su Excel.
**Preguntar el martes en la demo** — es una pregunta de 30 segundos con la pantalla al frente.

## 3) Meta diaria + calendario de días hábiles — 2 días

**Dónde está hoy:** `Meta` es mensual (`schema.prisma:1154`, unique `anio,mes,tipo,lineaId`) y el
reporte compara el **acumulado del mes** contra ella (`pctCumplimiento`,
`reporte-diario-core.ts:130`). El día 3 del mes, con todo perfecto, el cumplimiento se ve en 10%.

**Lo que pidió JP (2026-07-29):** metas **mensuales**, con seguimiento de cumplimiento **diario**.
O sea: no cambia el modelo, cambia el indicador. Falta el divisor — **no existe calendario de días
hábiles en el schema**.

**Diseño:**
- Modelo `DiaNoHabil` (fecha única, motivo) + config de qué días de la semana se trabaja. Con eso
  la pregunta abierta de si **trabajan sábados** deja de ser bloqueante: se configura y se cambia
  en un clic el día que el cliente diga.
- Sembrar los **festivos colombianos** del año (son ~18 y mueven la meta diaria de verdad).
- En el core: `metaEsperadaALaFecha = metaMensual × (hábiles transcurridos / hábiles del mes)` y
  `metaDiaria = metaMensual / hábiles del mes`. La fila diaria gana su semáforo contra `metaDiaria`
  y el bloque de metas muestra **real vs esperado a hoy**, no vs el mes entero.
- Todo el cálculo es puro → vive en `reporte-diario-core.ts` con specs; cero riesgo de datos.

**Riesgo:** ninguno de datos (es solo lectura), pero **cambia un número que el cliente ya vio** en
la demo anterior. Hay que explicárselo en la demo, no dejar que lo descubra.

---

## Preguntas abiertas que NO bloquean esta entrega

- Qué sub-paso de inyección cuenta como "inyectado" (§2) — se pregunta en la demo del martes.
- Si trabajan sábados (§3) — el calendario configurable lo absorbe.
- Los 2 NITs cruzados de la plantilla de BASARILI, `INDUSTRIAL ALEPH`, la dirección de
  DOTACIONES RAC y la plantilla de la línea ALTA (ver `AVANCE.md` §2.d).
