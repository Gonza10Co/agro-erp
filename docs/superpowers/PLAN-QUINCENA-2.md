# Plan — Quincena 2 del rediseño lote↔par: el par nace en el punto de conversión

> Diseño de fondo: `docs/specs/2026-08-20-trazabilidad-lote-par-design.md`.
> Quincena 1 (control por orden de corte) está **hecha y en prod** desde el 2026-08-26.
>
> Estado de este plan: **el puente está construido, el cordón no se ha cortado.**

## 1. Qué se hizo ya (2026-08-26) — la parte que no dependía de la planta

Todo aditivo, sin cambiar una sola línea del comportamiento que el cliente opera:

- **`Par.ordenCorteId`** (nullable + índice + FK) — el par ya puede decir de qué orden
  de corte salió. Es la trazabilidad hacia atrás que reemplaza al código de barras en
  corte: de una bota defectuosa en PT se llega a la orden del día, al turno, al material
  y a su consumo real.
- **`Linea.subPasoInicial`** (nullable) — el **punto de conversión lote→par** es un dato,
  no código. `subPasoInicial(celula, nacimiento)` y `generarPares` ya lo respetan, y
  `generarOF` lo lee con la misma cascada que la célula (línea de la OP > línea de la
  marca > histórico).
- Migración `20260826161102_par_conoce_su_orden_de_corte`.

**Hoy el campo está vacío en toda la base**, así que el par sigue entrando a guarnición
por `AREA` exactamente como siempre. Es capacidad instalada, no un cambio de conducta.

> Por qué así: la decisión de planta (¿Amarre o Alistamiento?) dejó de ser un rediseño y
> pasó a ser un `UPDATE`. Cuando JP responda, se llena el campo por línea y listo — igual
> que `celulaInicial` ya hace que Feroz arranque en Inyección.

## 2. Lo que falta — el corte del cordón

Esto **sí** cambia el flujo que el cliente usa a diario. No es aditivo.

| # | Cambio | Dónde |
|---|---|---|
| 1 | `generarOF` deja de crear pares; la OF queda con `cantAProducir` como meta | `fabricacion.service.ts:79-89` |
| 2 | Los pares nacen en el punto de conversión, de a uno o por canasta | endpoint nuevo |
| 3 | `avanzar()` arranca desde el punto de conversión, no desde CORTE | `fabricacion.service.ts` |
| 4 | La columna Corte del reporte diario lee `AvanceCorte`, no eventos de escaneo | `reportes.service.ts` |
| 5 | Desaparece el botón "imprimir etiquetas" al generar la OF | lista de OF |
| 6 | Al nacer, el par se sella con su `ordenCorteId` | endpoint nuevo |

### ⚠️ Lo que el diseño original no contemplaba

**`calidad.service.ts:180` también crea pares.** Un par de reposición nace cuando calidad
da de baja a otro. Hay que decidir de qué orden de corte nace ese par:

- **Opción A** — hereda el `ordenCorteId` del par que reemplaza. Mantiene la trazabilidad
  del material original, que es de donde salió la pieza defectuosa. **Recomendada.**
- **Opción B** — se le asigna la orden del día en que se repuso. Refleja el consumo real
  de material del día, pero pierde el origen del defecto.

No es una decisión de planta: se puede resolver internamente, pero hay que resolverla
antes de tocar `generarOF`, o los pares de reposición nacen huérfanos.

### Alcance medido (2026-08-26)

```
  12+ archivos de producción asumen que el par arranca en CORTE
  27 specs tocan el tema
   2 puntos de creación de pares (generarOF y calidad)
```

## 3. Los dos caminos según responda la planta

La pregunta abierta es dónde se pega la etiqueta. El **modelo es el mismo en los dos
casos**; cambia el valor de `Linea.subPasoInicial` y poco más.

### Camino A — AMARRE (lo que recomienda el diseño)

```
Linea.subPasoInicial = 'AMARRE'
```

El par nace al salir de Strobel, que es cuando las 24 piezas están juntas por primera vez.
- ✅ El par existe físicamente cuando se le pega el código.
- ✅ Una sola lectura por par, sin pasos intermedios ciegos.
- ✅ Coincide con el kickoff: *"en Amarre se lee el código y se carga al Almacén"*.
- ➖ Los 8 pasos previos de guarnición quedan sin dato por par (los cubre la orden).

### Camino B — ALISTAMIENTO (lo que propone JP)

```
Linea.subPasoInicial = 'AREA'   // el primer sub-paso de guarnición
```

- ➖ El par todavía no existe: se etiqueta un conjunto de piezas que aún se va a rearmar.
- ➖ Las piezas dañadas se reponen sobre la marcha ⇒ el conjunto etiquetado es inestable.
- ➖ Entre Alistamiento y Amarre no hay ninguna lectura intermedia en la propuesta de JP,
  así que anticipar la etiqueta 8 pasos **no aporta un solo dato nuevo**.
- ✅ Si la planta insiste, funciona igual: es el mismo enum, otro valor.

> Si sale el camino B, vale la pena preguntar qué se hace con un par etiquetado cuya
> pieza se repone: ¿se reetiqueta, o el código sobrevive al cambio de pieza?

## 4. Orden de ejecución sugerido

1. Resolver el par de reposición (A o B de arriba) — decisión interna, 10 min.
2. Endpoint de nacimiento del par + sellado de `ordenCorteId`. TDD.
3. `generarOF` deja de parir pares. **Acá se rompe lo que el cliente usa** ⇒ revisar las
   27 specs y el flujo completo OC→OP→OF→escaneo.
4. `avanzar()` desde el punto de conversión.
5. Reporte diario: columna Corte desde `AvanceCorte`.
6. Quitar el botón de etiquetas.
7. Poblar `Linea.subPasoInicial` en prod con lo que diga la planta.

## 5. Lo que sigue bloqueado por la planta

- [ ] ¿La etiqueta se pega en **Amarre** o en **Alistamiento**? (define el paso 7)
- [ ] Entre Amarre e Inyección, ¿se mueve **por par o por canasta**? (define si la lectura
      de inyección es una por par o una por corrida de horma)
- [ ] Etiquetadora térmica + rollos en el punto de conversión.
- [ ] Lectores (o celulares con cámara) en las 3 estaciones.

> ⚠️ **Los pares que ya existen en prod nacidos en CORTE no se migran.** Terminan su ciclo
> con la lógica vieja; el modelo nuevo aplica a los pares creados desde el cambio.
