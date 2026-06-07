# Diseño — MES: Núcleo de Trazabilidad · Demo 5

**Fecha:** 2026-06-07
**Branch:** `feat/mes-trazabilidad` (la crea Task 0 del plan)
**Módulo:** Fabricación (MES / piso de planta). Sigue el avance par-por-par de la producción a través de las células, con escaneo de código único.
**Estado previo:** el ciclo OC→OP→amarre PT está en master (Demo 1). Configurador BOM (D2), Despacho+cartera (D3) y Compras/Requerimientos (D4) están en `develop`. El schema llega hasta la **OP** (`OrdenProduccion` con `OrdenProduccionLineaTalla.cantAProducir` = lo que falta fabricar tras el amarre) y `InventarioPT` (producto terminado por producto+talla+bodega, con upsert). **No existe nada del piso de planta:** ni Orden de Fabricación, ni células, ni pares, ni escaneo, ni operarios/máquinas. El MES se construye casi de cero sobre la OP.

## Contexto: el MES es grande, esto es solo el núcleo

El briefing llama al MES "el módulo más pesado". No cabe en una demo. Se descompone en sub-demos; **esta es la primera (el núcleo de trazabilidad)**, base sobre la que se montan las demás:

```
⭐ D5  NÚCLEO TRAZABILIDAD  ← este spec
       OP → OF por célula + código único por par + escaneo
       "avanzar etapa" + tablero de estado en vivo
   D6  Calidad: catálogo daños/reprocesos + imputación a centro
       de costo + actas de baja con firma/evidencia
   D7  Detalle fino por célula (sub-tareas Guarnición, Almacén
       corva/horma, Inyección revisiones) + amarre de semielaborados
   D8  Indicadores: eficiencia x máquina/operario + alertas de demora
```

## 1. Objetivo

Desde una **OP con producción pendiente** (`cantAProducir > 0`), generar una **Orden de Fabricación (OF)** que **materializa cada par como una entidad con código único (QR)**. Cada par viaja por las 5 células (Corte → Guarnición → Almacén → Inyección → PT). En cada célula, el operario **escanea el código y avanza el par**, registrando un **evento de trazabilidad** (célula, operario, máquina, hora). Un **tablero kanban en vivo** muestra cuántos/qué pares hay en cada célula. Cuando un par sale de PT, queda **TERMINADO** y **suma a `InventarioPT`**, cerrando el ciclo con el Despacho (D3). Decisiones tomadas en brainstorming (2026-06-07).

## 2. Alcance

**Incluye:**
- Modelos nuevos: `OrdenFabricacion`, `Par`, `EventoTrazabilidad`, `Operario`, `Maquina` + enum `Celula`, `EstadoOF`, `EstadoPar`.
- Generación de OF desde una OP: 1 OP → 1 OF que materializa **N pares** (uno por unidad de `cantAProducir`, por producto configurado + talla), cada uno con **código único** apto para QR.
- **Avance secuencial** del par por las células vía escaneo, con registro de **evento de trazabilidad** (célula, operario, máquina, timestamp).
- **Cierre de ciclo:** al avanzar un par desde PT → `estado = TERMINADO` + **upsert a `InventarioPT`** (suma 1 a `cantDisponible` en la bodega de PT).
- **Tablero kanban en vivo** (5 columnas = células) con conteo y lista de pares por célula.
- **Detalle de par:** timeline de eventos de trazabilidad + render del **QR**.
- Catálogos mínimos `Operario` (con su célula) y `Maquina` (con su célula), poblados por seed.
- **QR visual imprimible** por par (render en el front desde el `codigo`).

**No incluye (demos futuras):**
- Calidad: daños/reprocesos tipificados, imputación a centro de costo, actas de baja (D6).
- Detalle fino de Guarnición (sub-tareas Armado→…→Strobel→Amarre), Almacén (corva/horma), Inyección (revisiones 6/10/13h) (D7).
- **Amarre de semielaborados por etapa** (capelladas/cortes ya existentes): en D5 **todo arranca desde Corte**.
- Indicadores de eficiencia, costos por centro, alertas de demora configurables (D8). *Nota:* el **dato** (operario/máquina/hora por evento) **se captura desde ya** para habilitar D8.
- **Escaneo con cámara real** (PWA): en D5 el código llega por input de teclado/lector; el QR solo se **muestra/imprime**.
- Reconciliación fina entre el `InventarioPT` recién producido y las reservas/amarre de la OP para despacho: en D5 solo se **suma `cantDisponible`**.
- Retrocesos / corrección de escaneos erróneos (solo avance hacia adelante en D5).

**Precondición de alcance:** se genera OF sobre `cantAProducir > 0`. Una OP 100% amarrada (todo `cantAProducir == 0`) no tiene nada que fabricar → no genera OF.

## 3. Flujo

```
OP (líneas-talla con cantAProducir > 0)
   │  POST /fabricacion/of  { opId }
   ▼
[ generar OF + pares ]
   │  consecutivo OF = max+1 (transacción, patrón OC/OP/Despacho)
   │  por cada (productoConfigurado, talla, cantAProducir):
   │     crear cantAProducir × Par {
   │        codigo = `OF{consecutivo}-{seq:0000}`,  ← único, va al QR
   │        productoConfiguradoId, tallaId,
   │        celulaActual = CORTE, estado = EN_PROCESO
   │     }
   ▼
[ pantalla operario ]  (contexto de puesto: célula + operario + máquina)
   │  escanea codigo → ve el par → [Avanzar]
   │  POST /fabricacion/par/:codigo/avanzar { operarioId, maquinaId }
   │     crea EventoTrazabilidad { celula = celulaActual, operario, maquina, ts }
   │     celulaActual = siguienteCelula(celulaActual)
   ▼
   ... repetir en cada célula: CORTE→GUARNICION→ALMACEN→INYECCION→PT ...
   ▼
[ avanzar desde PT ]  (no hay célula siguiente)
   │  crea evento de PT
   │  estado = TERMINADO
   │  upsert InventarioPT (+1 cantDisponible en bodega PT)
   │  si todos los pares de la OF están TERMINADO → OF.estado = TERMINADA
   ▼
[ tablero en vivo ]  GET /fabricacion/tablero?ofId=
   kanban 5 columnas con conteo + pares por célula
```

## 4. Cambios de schema (una migración)

```prisma
enum Celula {
  CORTE
  GUARNICION
  ALMACEN
  INYECCION
  PT
}

enum EstadoOF {
  ABIERTA      // creada, ningún par terminado
  EN_PROCESO   // al menos un par avanzó de CORTE
  TERMINADA    // todos los pares TERMINADO
  ANULADA
}

enum EstadoPar {
  EN_PROCESO
  TERMINADO
}

model OrdenFabricacion {
  id          Int       @id @default(autoincrement())
  consecutivo Int       @unique
  opId        Int                                  // varias OF por OP no se espera en D5, pero el modelo no lo impide
  op          OrdenProduccion @relation(fields: [opId], references: [id])
  fecha       DateTime  @default(now())
  estado      EstadoOF  @default(ABIERTA)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  pares Par[]

  @@index([opId])
}

model Par {
  id                    Int                 @id @default(autoincrement())
  codigo                String              @unique   // `OF{consecutivo}-{seq}`, contenido del QR
  ofId                  Int
  of                    OrdenFabricacion    @relation(fields: [ofId], references: [id])
  productoConfiguradoId Int
  productoConfigurado   ProductoConfigurado @relation(fields: [productoConfiguradoId], references: [id])
  tallaId               Int
  talla                 Talla               @relation(fields: [tallaId], references: [id])
  celulaActual          Celula              @default(CORTE)
  estado                EstadoPar           @default(EN_PROCESO)
  createdAt             DateTime            @default(now())
  updatedAt             DateTime            @updatedAt

  eventos EventoTrazabilidad[]

  @@index([ofId])
  @@index([celulaActual])
}

model EventoTrazabilidad {
  id         Int       @id @default(autoincrement())
  parId      Int
  par        Par       @relation(fields: [parId], references: [id])
  celula     Celula                                // célula donde se completó el trabajo
  operarioId Int
  operario   Operario  @relation(fields: [operarioId], references: [id])
  maquinaId  Int
  maquina    Maquina   @relation(fields: [maquinaId], references: [id])
  timestamp  DateTime  @default(now())

  @@index([parId])
  @@index([celula])
}

model Operario {
  id     Int     @id @default(autoincrement())
  nombre String
  celula Celula
  activo Boolean @default(true)

  eventos EventoTrazabilidad[]
}

model Maquina {
  id     Int     @id @default(autoincrement())
  codigo String  @unique
  nombre String
  celula Celula
  activo Boolean @default(true)

  eventos EventoTrazabilidad[]
}
```

Cambios en modelos existentes (solo inversas):
- `OrdenProduccion`: agregar `ordenesFabricacion OrdenFabricacion[]`.
- `ProductoConfigurado`: agregar `pares Par[]`.
- `Talla`: agregar `pares Par[]`.

## 5. Backend (módulo nuevo `fabricacion`)

```
POST /fabricacion/of                    { opId } → genera OF + pares; devuelve OF con conteo  (JwtAuthGuard)
GET  /fabricacion/of                    lista de OF (consecutivo, op, estado, #pares)
GET  /fabricacion/of/:id                detalle de OF (pares + célula actual de cada uno)
POST /fabricacion/par/:codigo/avanzar   { operarioId, maquinaId } → evento + transición de célula
GET  /fabricacion/par/:codigo           detalle del par + timeline de eventos
GET  /fabricacion/tablero               estado en vivo agrupado por célula (filtro opcional ?ofId=)
GET  /fabricacion/operarios             catálogo (filtro opcional ?celula=)
GET  /fabricacion/maquinas              catálogo (filtro opcional ?celula=)
```
> Todo bajo `JwtAuthGuard`. El **CRUD de operarios/máquinas** queda como mejora futura — en la demo los crea el seed.

**Lógica pura (sin DB, testeable):**
- `siguienteCelula(actual: Celula): Celula | null` — orden fijo `[CORTE, GUARNICION, ALMACEN, INYECCION, PT]`; devuelve la siguiente o `null` si es `PT` (última). Única fuente de verdad de la secuencia.
- `generarPares(consecutivoOF, lineas): ParData[]` — recibe las líneas-talla de la OP con `cantAProducir > 0` y emite un `ParData { codigo, productoConfiguradoId, tallaId }` por unidad. Códigos `OF{consecutivo}-{seq:0000}` con `seq` incremental global dentro de la OF. **Puro.**
- `esUltimaCelula(c: Celula): boolean` — helper para la regla de terminado (≡ `siguienteCelula(c) === null`).

**`FabricacionService.generarOF(opId)`:**
1. Carga la OP con `lineas.tallas` (filtra `cantAProducir > 0`). Si OP no existe → `NotFoundException`. Si no hay pendiente → `BadRequestException("La OP no tiene producción pendiente")`. Si ya existe una OF para esa OP (regla **1 OP → 1 OF** en D5) → `ConflictException("La OP ya tiene una OF")`.
2. **Transacción:** `consecutivo = (aggregate _max.consecutivo ?? 0) + 1`; crea `OrdenFabricacion`; `generarPares(...)` → `createMany` de `Par` (todos `celulaActual = CORTE`).
3. Devuelve `{ id, consecutivo, opId, totalPares }`.

**`FabricacionService.avanzar(codigo, { operarioId, maquinaId })`:**
1. Carga el par por `codigo`. No existe → `NotFoundException`. `estado == TERMINADO` → `ConflictException("El par ya está terminado")`.
2. **Transacción:**
   - Crea `EventoTrazabilidad { parId, celula: par.celulaActual, operarioId, maquinaId }`.
   - Si `esUltimaCelula(par.celulaActual)` (PT): `par.estado = TERMINADO`; **upsert `InventarioPT`** `(productoConfiguradoId, tallaId, bodegaId=BODEGA_PT)` → `+1 cantDisponible`; si todos los pares de la OF quedan `TERMINADO` → `OF.estado = TERMINADA`.
   - Si no: `par.celulaActual = siguienteCelula(...)`; si era `CORTE` y la OF estaba `ABIERTA` → `OF.estado = EN_PROCESO`.
3. Devuelve el par actualizado (nueva célula / estado).

> **Bodega de PT:** se usa la bodega `PROPIA` de mayor prioridad (la principal del seed). Constante/lookup en el service; documentar en el seed cuál es.
> **Validación operario↔célula:** el front filtra operarios/máquinas por la célula del puesto, así no llegan inconsistentes. El backend **no** valida estrictamente `operario.celula == par.celulaActual` en D5 (se deja como hardening futuro).

## 6. Frontend (feature `fabricacion`)

```
features/fabricacion/
  pantalla-operario.component.ts     contexto de puesto (célula+operario+máquina) + escaneo + avanzar
  tablero.component.ts               kanban 5 columnas, refresco en vivo
  par-detalle.component.ts           timeline de eventos + QR
  of-list.component.ts               lista de OF (entrada al tablero/detalle)
core/api/fabricacion.api.ts          FabricacionApi (of, avanzar, tablero, par, catálogos)
features/pedidos/op/op-detalle.component.ts   (MODIFICAR: botón "Generar OF")
```

- **OP detalle:** botón **"Generar OF"** visible cuando la OP tiene `cantAProducir > 0` y **aún no tiene OF**. Al click → `POST /fabricacion/of` → navega al tablero de la OF. Si la OP **ya tiene una OF** (regla D5: **1 OP → 1 OF**), el botón se reemplaza por **"Ver OF"** que navega al tablero existente (no regenera).
- **Pantalla operario:** se elige una vez el **contexto de puesto** (célula → operario y máquina filtrados por esa célula). Input de **código** (foco permanente, acepta Enter del lector) → muestra el par (producto, talla, célula actual) → botón **"Avanzar a {siguiente célula}"** (o "Terminar" si está en PT). Tras avanzar, limpia el input y queda listo para el próximo escaneo. Maneja errores: código inexistente, par ya terminado.
- **Tablero kanban:** 5 columnas (Corte, Guarnición, Almacén, Inyección, PT) con conteo y chips de pares; refresco por polling (intervalo corto) o botón "Actualizar". Filtra por OF.
- **Par detalle:** datos del par + **timeline** de eventos (célula, operario, máquina, hora) + **QR** renderizado desde `codigo` (botón imprimir).
- **QR:** librería de generación en el cliente (p. ej. `angularx-qrcode`); el contenido es `par.codigo`. Decisión final de librería en el plan.
- Reusa tokens del DS "Acero" + CDK, igual que pedidos/despachos/compras.

## 7. Manejo de errores / edge cases

| Caso | Resultado |
|------|-----------|
| OP inexistente al generar OF | 404 |
| OP sin `cantAProducir > 0` | 400 "La OP no tiene producción pendiente" |
| OP que ya tiene OF (regla 1 OP→1 OF) | 409 "La OP ya tiene una OF" |
| Código de par inexistente al avanzar | 404 |
| Par ya `TERMINADO` | 409 "El par ya está terminado" |
| Avanzar desde PT | termina el par + suma `InventarioPT` (no es error) |
| Último par de la OF termina | `OF.estado = TERMINADA` |
| `InventarioPT` sin registro (producto+talla+bodega) | upsert lo crea con `cantDisponible = 1` |
| operarioId / maquinaId inexistente | 400/404 (FK) — el front solo ofrece válidos |
| 401 | interceptor global existente |

## 8. Testing

- **Backend (unitario, puro):**
  - `siguienteCelula`: secuencia completa CORTE→…→PT; `PT → null`.
  - `generarPares`: cantidad correcta = Σ `cantAProducir`; códigos únicos y bien formados; mapea producto+talla.
  - `esUltimaCelula`: `true` solo para `PT`.
- **Backend (service, prisma mock + `$transaction`):**
  - `generarOF`: consecutivo = `max+1`; crea N pares en CORTE; OP inexistente → 404; OP sin pendiente → 400.
  - `avanzar`: crea evento con la célula actual; mueve a la siguiente; `ABIERTA→EN_PROCESO` al salir de CORTE; desde PT → `TERMINADO` + upsert `InventarioPT (+1)` + `OF.TERMINADA` cuando es el último; par inexistente → 404; par terminado → 409.
- **Frontend:**
  - `FabricacionApi` (HttpTestingController): generar OF, avanzar, tablero, par, catálogos.
  - `pantalla-operario`: contexto de puesto filtra operarios/máquinas por célula; escaneo → avanzar; errores (inexistente, terminado).
  - `tablero`: render 5 columnas + ubicación de pares por célula.
  - `par-detalle`: timeline ordenado + render de QR.
- **E2E manual (navegador):** login → OP con producción pendiente (9003) → "Generar OF" → tablero con todos los pares en Corte → en pantalla operario, escanear un par y avanzarlo por las 5 células → ver el tablero moverlo de columna en columna → al salir de PT, el par queda TERMINADO → verificar que `InventarioPT` sumó ese producto+talla.

## 9. Seed (`seed-demo`)

- **`Operario`**: al menos uno por célula (ej. "Cortador 1"/CORTE, "Guarnecedor 1"/GUARNICION, etc.).
- **`Maquina`**: al menos una por célula (ej. "Cortadora CNC"/CORTE, "Inyectora robot"/INYECCION, etc.).
- **Driver:** la **OP-9003** ya existe en el seed con `cantAProducir > 0` (driver de Compras D4) → sirve también como driver del MES. **Verificar que su `cantAProducir` total sea chico (24–48 pares)** para que la demo sea ágil; si es grande, ajustar la curva del seed de 9003 o crear una **OP-9005** dedicada con cantidades chicas. Limpiar `Par`/`EventoTrazabilidad`/`OrdenFabricacion` de las OPs de demo al inicio del seed (idempotencia, patrón D4).
- Documentar cuál es la **bodega PT** destino del cierre de ciclo (la `PROPIA` de mayor prioridad del seed).

## 10. Fuera de alcance (futuro)

- Calidad: daños/reprocesos tipificados + centros de costo + actas de baja (D6).
- Detalle fino por célula + amarre de semielaborados por etapa (D7).
- Indicadores de eficiencia (operario/máquina), costos por centro, alertas de demora (D8).
- Escaneo con cámara real (PWA), impresión térmica de etiquetas.
- Retroceso/corrección de eventos; anulación de pares; baja de pares.
- Reconciliación del `InventarioPT` producido con reservas/amarre de la OP para despacho.
- Código máster de empaque (caja con N pares) mencionado en el briefing.
