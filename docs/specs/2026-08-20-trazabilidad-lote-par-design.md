# Diseño — Trazabilidad en dos unidades: Orden de Corte (lote) ↔ Par

**Fecha:** 2026-08-20
**Estado:** propuesta, pendiente de validación en visita a planta
**Origen:** pregunta de Gabriel Pérez Serrano (2026-08-04) + respuestas de Juan Pablo Cardona
en audio del 2026-08-19 (`audios/TRANSCRIPCION-JP-2026-08-19-planta.md`)

---

## 1. El problema

El sistema hoy crea **todos los pares de una vez** al generar la OF
(`fabricacion.service.ts:77` → `tx.par.createMany`), y todos nacen en `CORTE` con su código
único. **Eso es un dato inventado:** en corte el par no existe. Las piezas se cortan en tendidos,
salen apiladas por tipo de material, y una capellada no pertenece a ningún par hasta que alguien
la arma.

Gabriel lo formuló así: *"¿En cuál de los varios cortes que componen una bota se pone el código
de barras?"* La respuesta honesta es: en ninguno.

## 2. El principio de diseño

> **Se traza lo que existe.** Antes de Strobel lo que existe es la ORDEN DE CORTE.
> Desde Amarre lo que existe es el PAR.

Dos unidades de trabajo, dos sistemas de medición, un punto de conversión.

```
OC ─┐
OC ─┼─► PROGRAMA DE CORTE ──► ORDEN DEL DÍA (AGR-861)
OC ─┘   1 por planta               1 fecha · 1 marca · tallas 34→46
                                   ≈1.206 pares · 50-60 atados
                                          │
        ┌─────────────── unidad: ORDEN ───┴────────────┐   ┌──── unidad: PAR ────┐
        │  CORTE ──────────► GUARNICIÓN (9 pasos)      │   │                     │
        │  reloj + conteo    ...CIERRE → STROBEL ──────┼──►│ AMARRE 📷 nace el par
        │  sin código                    par armado    │   │   ↓                 │
        └──────────────────────────────────────────────┘   │ INYECCIÓN 📷        │
                                                           │   ↓                 │
                                                           │ EMPAQUE 📷 ─► etiqueta
                                                           │            de la CAJA
                                                           └─────────────────────┘
```

## 3. Hechos que sostienen el diseño (JP, 2026-08-19)

| Hecho | Consecuencia de diseño |
|---|---|
| **24 piezas por par** (algunos modelos 22 o 18); cortadora ~30.000 piezas/día → **~1.250 pares/día** | 1.250 etiquetas/día ≈ 2,6/min. Viable en una sola estación |
| La orden de corte está **amarrada a la fecha**, no al pedido. *"Para hoy 19 tenemos la orden 680 con los 1.200 pares que vamos a trabajar hoy"* | Hay que modelar una capa de **programación diaria por planta** que hoy no existe |
| *"No llevan ninguna etiqueta, solamente se está marcando **el número de la orden**... esa misma se les pone a las canastas"* | El identificador de lote **ya existe en papel**. Solo hay que volverlo código |
| El atado se arma **por material**: micropiel 20, rossy 40, plantillas 50 pares | El atado **no puede** ser unidad de par. Descartado como entidad |
| Pieza dañada **se repone al instante**; si se cuela, guarnición la devuelve a corte | **No hay atados incompletos.** No se modela merma por lote; se modela **reposición** |
| *"Un par definitivo cuando ya está en **Strobel** y pasa a la persona de amarre"* | El par nace al **cerrar Strobel**. Amarre es la primera estación con el par en la mano |
| *"No tenemos lector y tampoco tenemos códigos por el momento"* | Partimos de cero: no hay que respetar ninguna codificación de planta preexistente |
| Gabriel quiere ver *"las piezas que se vuelven a cortar y que lo cortado sea lo especificado en la orden"* | Su necesidad se satisface **sin un solo código de barras** |

## 4. Modelo de datos

### 4.1 Capa nueva: programación de corte

```prisma
enum EstadoOrdenCorte {
  PROGRAMADA      // está en el plan del día, no ha arrancado
  EN_CORTE        // toque 1: la mesa arrancó
  ENTREGADA       // toque 2: corte entregó las canastas a guarnición
  EN_GUARNICION   // guarnición la recibió
  CERRADA         // el último par de la orden pasó por Amarre
  ANULADA
}

model OrdenCorte {
  id       Int      @id @default(autoincrement())
  codigo   String   @unique          // "AGR-861", "AGR-868-1" (sufijo -1 = Feroz)
  fecha    DateTime                  // día de trabajo programado
  lineaId  Int                       // la planta: Agro | Basarili | Alta | Feroz
  linea    Linea    @relation(fields: [lineaId], references: [id])
  marcaId  Int?                      // la programación se hace por marca
  marca    Marca?   @relation(fields: [marcaId], references: [id])
  estado   EstadoOrdenCorte @default(PROGRAMADA)

  // Los 4 toques que dan el reloj. Sin esto no hay alertas.
  inicioCorte       DateTime?
  entregaCorte      DateTime?   // corte → guarnición
  inicioGuarnicion  DateTime?
  cierreGuarnicion  DateTime?   // último par amarrado

  observaciones String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  lineas   OrdenCorteLinea[]
  avances  AvanceCorte[]
  pares    Par[]                     // los pares que nacieron de esta orden

  @@index([fecha, lineaId])
  @@index([estado])
}

model OrdenCorteLinea {
  id                    Int  @id @default(autoincrement())
  ordenCorteId          Int
  ordenCorte            OrdenCorte @relation(fields: [ordenCorteId], references: [id])
  productoConfiguradoId Int
  tallaId               Int
  cantProgramada        Int          // lo que dice el formato del cliente
  cantCortada           Int  @default(0)   // lo que corte reportó entregado
  cantAmarrada          Int  @default(0)   // pares que efectivamente llegaron a Amarre

  // A qué OF alimenta este renglón. Opcional: una orden de corte puede
  // producir contra stock. Una OF grande se reparte en varias órdenes de corte.
  ofId Int?

  @@unique([ordenCorteId, productoConfiguradoId, tallaId])
  @@index([ofId])
}
```

> **Cardinalidad:** `OF ↔ OrdenCorte` es **N↔N** y se resuelve por `OrdenCorteLinea.ofId`.
> Un pedido de 5.000 pares se corta en 4 días (4 órdenes); una orden de un día puede
> alimentar varios pedidos de la misma marca.

### 4.2 Avance y consumo de corte (registro agregado, no por par)

Reemplaza el Excel que hoy lleva el jefe de corte.

```prisma
model AvanceCorte {
  id             Int      @id @default(autoincrement())
  ordenCorteId   Int
  ordenCorte     OrdenCorte @relation(fields: [ordenCorteId], references: [id])
  fecha          DateTime @default(now())
  piezasCortadas Int
  piezasDanadas  Int      @default(0)
  piezasRepuestas Int     @default(0)   // ← el indicador que pidió Gabriel
  operarioId     Int?
  observaciones  String?

  consumos ConsumoCorteMaterial[]

  @@index([ordenCorteId])
}

model ConsumoCorteMaterial {
  id            Int     @id @default(autoincrement())
  avanceCorteId Int
  avanceCorte   AvanceCorte @relation(fields: [avanceCorteId], references: [id])
  materialId    Int
  cantTeorica   Decimal @db.Decimal(14, 4)   // del BOM × pares programados
  cantReal      Decimal @db.Decimal(14, 4)   // lo que el jefe de corte midió

  @@unique([avanceCorteId, materialId])
}
```

> **Reusar lo que ya existe:** la Entrega 6 ya trajo *consumo real de MP por OF*. `ConsumoCorteMaterial`
> debe apoyarse en ese mecanismo, no duplicarlo — evaluar si es la misma tabla con otro origen.

### 4.3 Cambios en `Par`

`Par` **casi no cambia**. Lo que cambia es **cuándo se crea**.

```prisma
model Par {
  // ... todo lo actual se mantiene ...
  ordenCorteId Int?        // ← NUEVO: de qué orden de corte salió.
  ordenCorte   OrdenCorte? @relation(fields: [ordenCorteId], references: [id])
  // celulaActual arranca en GUARNICION/AMARRE (o INYECCION en Feroz), ya no en CORTE
}
```

`ordenCorteId` es la **trazabilidad hacia atrás sin código en corte**: de una bota defectuosa
en PT se llega a la orden del día, al turno, al material y al consumo — que es toda la
trazabilidad que el proceso físico permite.

### 4.4 Qué se rompe en el código actual

| Dónde | Qué pasa hoy | Qué debe pasar |
|---|---|---|
| `fabricacion.service.ts:77` `generarOF` | Crea **todos** los pares con `createMany` en `CORTE` | Crea la OF y **cero pares**. La OF queda con `cantAProducir` como meta |
| `generarPares()` en `fabricacion-core.ts` | Genera N códigos correlativos por OF | Se invoca **en Amarre**, de a un par (o por canasta) |
| Botón "imprimir etiquetas" en lista de OF | Imprime N etiquetas al generar la OF | Desaparece. La etiqueta se imprime en Amarre |
| `avanzar(codigo)` desde CORTE | Escanea un par que "está en corte" | Corte deja de tener pares. `avanzar` arranca desde AMARRE |
| Reporte diario · columna Corte | Cuenta pares en `celulaActual = CORTE` | Cuenta **piezas/pares de `AvanceCorte`** de las órdenes del día |
| Reporte diario · Guarnición | Ya cuenta solo el sub-paso `AMARRE` ✅ | Sin cambio — **ya estaba bien** |
| Línea **Feroz** (`celulaInicial = INYECCION`) | Nace en inyección | Sin cambio: no pasa por corte ni guarnición ✅ |

> ⚠️ **Los pares que ya existen en prod nacidos en CORTE no se migran.** Se dejan terminar su
> ciclo con la lógica vieja; el corte nuevo aplica solo a órdenes creadas desde el cambio.

## 5. Tramo 1 — Control por orden (sin código de barras)

**Captura:** el jefe de corte digita en la app lo que hoy escribe en su Excel.
**Toques mínimos:** inicio de corte · entrega a guarnición · recepción en guarnición.

**Indicadores que salen:**

| Indicador | Fórmula | Para quién |
|---|---|---|
| **Cumplimiento de corte** | `cantCortada / cantProgramada` por orden | Gabriel |
| **Índice de reposición** | `piezasRepuestas / piezasCortadas` | Gabriel |
| **Aprovechamiento de material** | `cantReal / cantTeorica` por material | Gerencia / costos |
| **Ciclo de corte** | `entregaCorte − inicioCorte` | Planeación |
| **Ciclo de guarnición** | `cierreGuarnicion − inicioGuarnicion` | Planeación |
| **Rendimiento de guarnición** | `cantAmarrada / cantCortada` | Planta |
| **WIP en piso** | `cantCortada − cantAmarrada` (por diferencia) | Gerencia |

**Alertas:**
- Orden que lleva más de *N* días sin entregarse de corte.
- Orden entregada con desviación > *X%* frente a lo programado.
- Reposiciones por encima del *Y%* de las piezas cortadas.
- Orden entregada a guarnición y sin pares amarrados después de *Z* días.

## 6. El punto de conversión — Amarre

En Amarre hay **una persona manipulando par por par**. Ahí:

1. Lee el código de la **orden de corte** (el de la canasta).
2. Selecciona referencia + talla (o lo hereda de la orden si es homogénea).
3. **Se imprime y pega la etiqueta del par** → nace el `Par` con su código único.
4. El par queda cargado al Almacén (el kickoff ya lo decía: *"en Amarre se lee el código
   y se carga al Almacén"*).

**Contenido de la etiqueta:** código único · referencia · marca · talla · orden de corte · fecha.

> **Decisión pendiente — dónde se pega la etiqueta.** JP propone **Alistamiento**
> (primer paso de guarnición). Recomendación de este diseño: **Amarre**, porque
> (a) en Alistamiento el par todavía no existe — lo dice el propio JP;
> (b) las piezas dañadas se reponen sobre la marcha, así que el conjunto etiquetado es
> inestable; (c) entre Alistamiento y Amarre **no hay ninguna lectura intermedia** en la
> propuesta de JP, así que anticipar la etiqueta 8 pasos no aporta un solo dato.
> **A resolver en la visita a planta.**

## 7. Tramo 2 — Control por par (ya construido)

Tres lecturas, no más:

| # | Estación | Acción | Qué habilita |
|---|---|---|---|
| 1 | **Amarre** | imprime + lee | Nace el par. Ingreso a Almacén. Cierra el reloj de la orden |
| 2 | **Inyección** | lee al recibir | Confirma recepción. Sub-pasos `MONTAJE→IMPACTO` ya modelados |
| 3 | **Empaque** | lee el par | **Imprime la etiqueta de la caja ya rotulada** → ingreso a bodega PT |

Todo lo demás desde Amarre **ya está construido y en producción**: eventos de trazabilidad,
operario, máquina, incidencias de calidad, segundas, kardex PT por línea, despachos, facturación.

> ⚠️ En Inyección la lectura debe contar **una sola vez** para el reporte diario (hoy se cuenta
> solo `IMPACTO`, si no se cuadruplica).

## 8. Qué NO se hace, y por qué

| Descartado | Razón |
|---|---|
| Modelar el **atado** como entidad | Su tamaño depende del material (20/40/50), no del par. Nunca podría ser unidad de trazabilidad |
| **Merma por lote** | Las piezas dañadas se reponen al instante; el lote nunca sale incompleto |
| Código de barras **en corte** | El par no existe. Serían 30.000 etiquetas/día para un dato inventado |
| Lectura en **cada uno de los 9 pasos** de guarnición | El par no existe hasta Strobel; y el atado viaja junto, se desamarra solo para coser |

## 9. Plan por entregas (quincenales)

| Quincena | Alcance | Depende de |
|---|---|---|
| **1** | `OrdenCorte` + programación diaria + importar el formato del cliente + **tablero de corte** (programado vs. cortado, reposiciones, consumo teórico vs. real) | El Excel del jefe de corte. **Sin hardware.** Le da a Gabriel lo que pidió |
| **2** | Nacimiento del par en Amarre + etiqueta + lectura. Migración de `generarOF` | Decisión Amarre vs. Alistamiento + etiquetadora |
| **3** | Lecturas de Inyección y Empaque + impresión de la etiqueta de caja | Lectores + impresora en empaque |
| **4** | Reloj por orden, umbrales y alertas | Que los toques ya se estén registrando |

> La **Quincena 1 no depende de comprar un solo equipo** y es la que responde la pregunta de
> Gabriel. Es el arranque correcto.

## 10. Qué se necesita de la planta

**Datos (antes de la Quincena 1):**
- [ ] El **Excel del jefe de corte** (programación, consumo teórico vs. real, piezas cortadas). JP ofreció conseguirlo.
- [ ] Los formatos de programación de **Basarili** y **Línea Alta** (solo llegó el de Agro).
- [ ] **Piezas por par por referencia** (24 / 22 / 18) — sin esto no se cuadran piezas contra pares.
- [ ] Capacidad real de la cortadora (JP pidió verificarla con el operador).

**Equipo (Quincenas 2-3):**
- [ ] Etiquetadora térmica + rollos en Amarre.
- [ ] 3 lectores (Amarre, Inyección, Empaque) — o celulares con cámara.
- [ ] Impresora de etiqueta de caja en Empaque (puede ser la misma de Amarre).

## 11. Preguntas abiertas para la visita a planta

1. **¿La etiqueta se pega en Amarre o en Alistamiento?** (la decisión de diseño más importante)
2. Entre Amarre e Inyección, ¿se mueve **por par o por canasta / corrida de horma**?
   La inyección va por molde y talla — si va por corrida, la lectura 2 puede ser por canasta.
3. ¿Cómo se numeran las órdenes en **Basarili** y **Alta**? (Agro usa `AGR-861`; JP mencionó una "680")
4. ¿Una orden de corte es **siempre de una sola marca**? En el formato sí, pero aparece
   "FEROZ BASARILI" como marca propia.
5. ¿**Quién** marca inicio y fin de la orden en corte, y con qué dispositivo?
6. ¿La **reposición** de una pieza se registra hoy en algún lado, o solo se recorta y ya?
7. La ficha FEROZ trae **troquelado y guarnición completos**, pero se decía que a Feroz solo se
   le presta inyección — ¿cambió? (existe además una hoja nueva `102 DESDE STROBEL`, que sí es
   la maquila pura: troquelado mínimo + inyección + empaque)
