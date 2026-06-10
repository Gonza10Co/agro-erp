# Diseño — Calidad MES: daños, reprocesos y centros de costo · Demo 6

**Fecha:** 2026-06-10
**Branch:** `feat/calidad-mes` (la crea Task 0 del plan)
**Módulo:** Calidad (capa transversal sobre Fabricación/MES). Tipificación de daños y reprocesos, imputación al centro de costo causante, actas de baja y dashboard de indicadores de calidad.
**Estado previo:** el núcleo MES (D5) está en `develop`: `OrdenFabricacion`, `Par` (código único `OF{n}-{seq}`), `EventoTrazabilidad`, `Operario`, `Maquina`, escaneo "avanzar etapa", tablero kanban y cierre de ciclo a `InventarioPT`. `EstadoPar` tiene `EN_PROCESO | TERMINADO | CANCELADO` (CANCELADO llegó con el hardening de anular OP). **No existe nada de calidad:** ni catálogo de daños, ni incidencias, ni bajas, ni reposiciones. Deuda conocida de D5: los pares `CANCELADO` no se ven en el tablero.

## Contexto: posición en la descomposición del MES

```
   D5  NÚCLEO TRAZABILIDAD  ✅ (en develop)
⭐ D6  CALIDAD              ← este spec
       catálogo daños/reprocesos + imputación a centro de costo
       + acta de baja + reposición + dashboard
   D7  Detalle fino por célula + amarre de semielaborados
   D8  Indicadores: eficiencia x máquina/operario + alertas de demora
```

## 1. Objetivo

Sobre el flujo de escaneo de D5, permitir que el operario **reporte un daño sobre un par** eligiendo un **tipo de daño tipificado** de un catálogo. El catálogo determina **la célula causante (centro de costo)** y **la clase** del daño:

- **REPROCESO** (recuperable): se registra la incidencia imputada a la célula causante; el par **no se mueve** y sigue su flujo.
- **BAJA** (daño total): exige **acta digital** (autorización de un usuario GERENTE/ADMIN + descripción obligatoria); el par pasa a `DADO_DE_BAJA` y el sistema crea **automáticamente un par de reposición en CORTE** dentro de la misma OF, para que la OF nunca pierda cantidad ("se repone, se tipifica y se carga al proceso", briefing §5).

Un **dashboard de calidad** muestra la imputación por centro de costo: incidencias, bajas, reprocesos, % sobre pares producidos y top de tipos de daño. Decisiones tomadas en brainstorming (2026-06-10).

## 2. Alcance

**Incluye:**
- Modelos nuevos: `TipoDano` (catálogo con `celulaCausante` y `clase BAJA|REPROCESO`) e `IncidenciaCalidad`.
- `EstadoPar` += `DADO_DE_BAJA`; `Par` += autorrelación `reponeAParId` (el par de reposición apunta al par que repone).
- **Reportar incidencia** desde la pantalla operario (escaneo): tipo de daño + operario que reporta; `celulaDeteccion` = célula actual del par. La **imputación sale del catálogo**, no del operario (filosofía "entre menos datos manuales, mejor").
- **Flujo de baja transaccional:** par → `DADO_DE_BAJA` + acta (autorizador con rol GERENTE/ADMIN tomado del JWT, patrón despacho D3) + par de reposición `{codigo}-R{n}` en CORTE.
- **Dashboard de calidad** por centro de costo (célula causante): conteos, % y top tipos de daño.
- **Visibilidad en tablero** de pares `DADO_DE_BAJA` y `CANCELADO` (salda la deuda de D5).
- **Incidencias en la línea de tiempo** del par-detalle, intercaladas con los eventos de trazabilidad.
- Catálogo `TipoDano` poblado por seed (~8 tipos del briefing).

**No incluye (demos futuras / hardening):**
- Valoración en **pesos** de las bajas (costo del par vía BOM) — la imputación de D6 es conteo e indicadores; la base queda modelada.
- Foto/archivo de **evidencia** en el acta (requiere storage externo; Railway no persiste archivos).
- Firma manuscrita / PDF del acta.
- CRUD de `TipoDano` (lo crea el seed; mantenimiento por UI es mejora futura).
- Daños sobre pares `TERMINADO` (devoluciones post-PT) — fuera; reportar sobre no-`EN_PROCESO` es 409.
- Retroceso físico del par a la célula causante (el reproceso es solo registro; el par se rehace donde está).
- Alertas de demora y eficiencia por operario/máquina (D8).

## 3. Flujo

```
[ pantalla operario ]  par escaneado (EN_PROCESO)
   │  botón [Reportar daño] junto a [Avanzar]
   │  elige TipoDano del catálogo
   ▼
   ¿clase del tipo?
   │
   ├─ REPROCESO ──► POST /calidad/pares/:codigo/incidencias
   │                { tipoDanoId, operarioId, descripcion? }
   │                crea IncidenciaCalidad
   │                  celulaDeteccion = par.celulaActual
   │                  imputación = tipoDano.celulaCausante
   │                el par NO se mueve, sigue su flujo
   │
   └─ BAJA ───────► mismo endpoint; exige además:
                    - sesión JWT con rol GERENTE/ADMIN (el acta)
                    - descripcion obligatoria
                    transacción:
                      1. par EN_PROCESO → DADO_DE_BAJA  (updateMany
                         condicionado: si otro lo terminó/canceló → 409)
                      2. IncidenciaCalidad { autorizadoPorId = user.sub,
                         parReposicionId }
                      3. Par reposición: codigo = codigoReposicion(par),
                         misma talla/producto/OF, CORTE, EN_PROCESO,
                         reponeAParId = par.id
                    la OF sigue EN_PROCESO (el par de reposición está vivo)
                    InventarioPT NO se toca (el par nunca llegó a PT)
   ▼
[ dashboard calidad ]  GET /calidad/indicadores
   por centro de costo (célula causante): #incidencias, #bajas,
   #reprocesos, % sobre pares producidos + top tipos de daño
```

**Código de reposición — `codigoReposicion(codigo)` (puro):** si el código no termina en `-R{n}` → `{codigo}-R1`; si ya termina en `-R{n}` → incrementa n. Cadena: `OF12-0003` → `OF12-0003-R1` → `OF12-0003-R2`. Único por construcción: solo hay un par vivo por cadena (los anteriores quedan `DADO_DE_BAJA`).

## 4. Cambios de schema (una migración)

```prisma
enum ClaseDano {
  BAJA        // daño total: acta + reposición
  REPROCESO   // recuperable: solo registro
}

enum EstadoPar {
  EN_PROCESO
  TERMINADO
  CANCELADO
  DADO_DE_BAJA   // ← nuevo
}

model TipoDano {
  id             Int       @id @default(autoincrement())
  codigo         String    @unique   // "STROBEL-RASGADO"
  nombre         String              // "Strobel rasgado"
  celulaCausante Celula              // centro de costo al que se imputa
  clase          ClaseDano
  activo         Boolean   @default(true)

  incidencias IncidenciaCalidad[]
}

model IncidenciaCalidad {
  id              Int      @id @default(autoincrement())
  parId           Int
  par             Par      @relation("incidencias", fields: [parId], references: [id])
  tipoDanoId      Int
  tipoDano        TipoDano @relation(fields: [tipoDanoId], references: [id])
  celulaDeteccion Celula            // dónde se detectó (≠ causante posible)
  operarioId      Int               // quién reporta
  operario        Operario @relation(fields: [operarioId], references: [id])
  descripcion     String?           // obligatoria en BAJA (acta)
  autorizadoPorId Int?              // solo BAJA: user GERENTE/ADMIN del JWT
  autorizadoPor   User?    @relation(fields: [autorizadoPorId], references: [id])
  parReposicionId Int?     @unique  // solo BAJA: el par creado para reponer
  parReposicion   Par?     @relation("reposicionDeIncidencia", fields: [parReposicionId], references: [id])
  timestamp       DateTime @default(now())

  @@index([parId])
  @@index([tipoDanoId])
}
```

Cambios en modelos existentes:
- `Par`: += `reponeAParId Int?` + autorrelación `reponeA Par?` / `repuestoPor Par[]`; inversas `incidencias IncidenciaCalidad[]` (relación "incidencias") y `reposicionDeIncidencia IncidenciaCalidad?`.
- `Operario`: += `incidencias IncidenciaCalidad[]`.
- `User`: += `incidenciasAutorizadas IncidenciaCalidad[]`.

> Nota: la **imputación al centro de costo no se duplica** en `IncidenciaCalidad`: se deriva siempre de `tipoDano.celulaCausante` (única fuente de verdad). El dashboard agrupa por join.

## 5. Backend (módulo nuevo `calidad`)

```
GET  /calidad/tipos-dano                 catálogo activo (para el selector del front)
POST /calidad/pares/:codigo/incidencias  { tipoDanoId, operarioId, descripcion? } → reportar
GET  /calidad/indicadores                agregados por centro de costo + top tipos de daño
```
> Todo bajo `JwtAuthGuard`. El POST recibe al usuario del JWT (decorador existente) para validar el rol cuando la clase es BAJA — mismo patrón que `DespachoService` (D3).

```
backend/src/calidad/
  calidad-core.ts          lógica pura: codigoReposicion(), validarReporte()
  calidad-core.spec.ts
  calidad.service.ts       Prisma + transacción de baja
  calidad.service.spec.ts
  calidad.controller.ts    delgado
  calidad.module.ts
  dto/reportar-incidencia.dto.ts   tipoDanoId, operarioId (Int, Min 1), descripcion (MaxLength)
```

**Lógica pura (`calidad-core.ts`):**
- `codigoReposicion(codigo: string): string` — `OF12-0003` → `OF12-0003-R1`; `...-R2` → `...-R3`.
- `validarReporte(clase, descripcion, rol)` — para BAJA: descripción no vacía y rol ∈ {GERENTE, ADMIN}; devuelve el error tipado o null (el service lo traduce a excepción HTTP).

**`CalidadService.reportar(codigo, dto, user)`:**
1. Carga par por `codigo` (404 si no existe) y `TipoDano` (404 si no existe o inactivo).
2. Par no `EN_PROCESO` → 409 con mensaje según estado (terminado / cancelado / ya dado de baja).
3. **REPROCESO:** crea `IncidenciaCalidad` y devuelve la incidencia (sin transacción extra).
4. **BAJA:** `validarReporte` → 400 (sin descripción) / 403 (rol insuficiente). **Transacción:**
   - `par.updateMany({ where: { id, estado: 'EN_PROCESO' }, data: { estado: 'DADO_DE_BAJA' } })`; si `count === 0` → 409 (otro proceso lo movió — mismo patrón anti-race del cierre de OF).
   - Crea par de reposición (`codigoReposicion`, misma talla/producto/OF, `CORTE`, `reponeAParId`).
   - Crea `IncidenciaCalidad { autorizadoPorId: user.sub, parReposicionId }`.
   - Devuelve `{ incidencia, parReposicion }`.
5. FK inválida (P2003) → 400 con campo concreto (patrón `FabricacionService.avanzar`).

**`CalidadService.indicadores()`:**
- `groupBy` de incidencias join `TipoDano` → por `celulaCausante`: total, bajas, reprocesos.
- % de daños = incidencias de la célula / pares que **pasaron** por ella (count de `EventoTrazabilidad` por célula; PT aparte). Denominador 0 → % null (el front muestra "—").
- Top 5 tipos de daño por frecuencia (global).

**Cambios en `fabricacion`:**
- `obtenerPar`: incluir `incidencias` (con tipo, operario, autorizador) para la línea de tiempo.
- `tablero`: hoy filtra implícitamente nada — los pares `DADO_DE_BAJA`/`CANCELADO` deben llegar al front (siguen llegando; el cambio de visibilidad es del front). Verificar que el avance (`avanzar`) ya rechaza no-`EN_PROCESO` → cubre `DADO_DE_BAJA` con el mensaje genérico; ajustar mensaje: "El par fue dado de baja".

## 6. Frontend

```
features/calidad/
  dashboard-calidad.component.ts    tarjetas por centro de costo + top daños
core/api/calidad.api.ts             CalidadApi (tipos-dano, reportar, indicadores)
features/fabricacion/pantalla-operario.component.ts   (MODIFICAR: botón "Reportar daño" + panel de reporte)
features/fabricacion/tablero.component.ts             (MODIFICAR: sección/badges de bajas y cancelados)
features/fabricacion/par-detalle.component.ts         (MODIFICAR: incidencias en la timeline + cadena de reposición)
```

- **Pantalla operario:** con un par `EN_PROCESO` en pantalla, botón secundario **"Reportar daño"** abre un panel: selector de tipo de daño (muestra nombre + clase + célula causante como hint). Si la clase es **REPROCESO** → botón "Registrar reproceso" directo. Si es **BAJA** → el panel exige **descripción** y avisa que la baja queda autorizada por el usuario de la sesión (debe ser gerente/admin; si el rol no alcanza, el botón se deshabilita con explicación). Tras una baja exitosa muestra el **código del par de reposición** creado ("Repuesto por OF12-0003-R1, en Corte"). Errores de red/409 con el patrón robusto existente.
- **Dashboard calidad** (ruta nueva en el shell): una tarjeta por centro de costo (CORTE…INYECCION) con #incidencias, #bajas, #reprocesos y % de daño; tabla "Top tipos de daño". Botón actualizar (sin polling).
- **Tablero:** los pares `DADO_DE_BAJA` y `CANCELADO` se muestran en una **franja inferior "Fuera de flujo"** con badge de color por estado (no ocupan columna de célula). Los chips de par dañado enlazan a par-detalle.
- **Par-detalle:** incidencias intercaladas por timestamp en la timeline (icono distinto: ⚠ reproceso, ✖ baja con autorizador); si el par repone a otro o fue repuesto, se muestra la **cadena de reposición** con links.
- Tokens "Acero" + patrones existentes (signals, `@if/@for`, specs con `HttpTestingController` contra `:3001`).

## 7. Manejo de errores / edge cases

| Caso | Resultado |
|------|-----------|
| Par inexistente al reportar | 404 |
| TipoDano inexistente o inactivo | 404 |
| Par `TERMINADO` / `CANCELADO` / `DADO_DE_BAJA` | 409 con mensaje específico |
| BAJA sin descripción | 400 "La baja requiere descripción (acta)" |
| BAJA con sesión sin rol GERENTE/ADMIN | 403 "Solo un gerente puede autorizar una baja" |
| Race: par terminado/cancelado entre lectura y baja | 409 (updateMany count 0) |
| operarioId inexistente | 400 (P2003 → campo concreto) |
| Reposición de un par ya repuesto (re-daño del `-R1`) | normal: `-R2`, cadena continua |
| Anulación de OP con pares `DADO_DE_BAJA` | los dados de baja no cambian (solo se cancelan `EN_PROCESO`) — verificar con test |
| Dashboard sin datos | tarjetas en 0, % "—" |
| 401 | interceptor global existente |

## 8. Testing

- **Backend (puro, `calidad-core.spec.ts`):**
  - `codigoReposicion`: base → `-R1`; `-R1` → `-R2`; `-R9` → `-R10`; no confunde sufijos del código original.
  - `validarReporte`: BAJA sin descripción / rol insuficiente / OK; REPROCESO no exige nada.
- **Backend (service, prisma mock):**
  - REPROCESO: crea incidencia, no toca el par.
  - BAJA: transacción completa (estado, reposición con talla/producto/OF correctos, incidencia con autorizador); 400/403/409/404 de la tabla; race → 409.
  - `indicadores`: agrupa por célula causante (no por detección); % con denominador 0.
- **Backend (fabricación):** `avanzar` sobre par `DADO_DE_BAJA` → 409; anular OP no toca dados de baja.
- **Frontend:**
  - `CalidadApi` (HttpTestingController): tipos-dano, reportar, indicadores.
  - `pantalla-operario`: panel de reporte; REPROCESO directo; BAJA exige descripción y muestra reposición; rol insuficiente deshabilita.
  - `dashboard-calidad`: render de tarjetas + top daños; estado vacío.
  - `tablero`: franja "Fuera de flujo" con bajas/cancelados.
- **E2E manual (navegador):** login gerente → OP-9005 → OF → avanzar un par hasta GUARNICION → reportar "strobel rasgado" (REPROCESO, imputa a GUARNICION) → par sigue su flujo → reportar "daño de robot" (BAJA) sobre otro par en INYECCION → acta con descripción → par `DADO_DE_BAJA` + reposición `-R1` visible en CORTE en el tablero → dashboard muestra la imputación (GUARNICION 1 reproceso, INYECCION 1 baja) → avanzar la reposición hasta PT y verificar que `InventarioPT` suma normal.

## 9. Seed (`seed-demo`)

Catálogo `TipoDano` (~8, del briefing §5/§Inyección):

| codigo | nombre | causante | clase |
|---|---|---|---|
| CORTE-PEQUENO | Corte muy pequeño | CORTE | BAJA |
| CORTE-GRANDE | Corte muy grande | CORTE | REPROCESO |
| PIEZA-DANADA | Pieza dañada en corte | CORTE | BAJA |
| COSTURA-DEFECTUOSA | Costura defectuosa | GUARNICION | REPROCESO |
| STROBEL-RASGADO | Strobel rasgado | GUARNICION | REPROCESO |
| STROBEL-TORCIDO | Strobel torcido | GUARNICION | REPROCESO |
| ECONOMIZADOR-RASGADO | Economizador rasgado | INYECCION | REPROCESO |
| DANO-ROBOT | Daño de robot en capellada | INYECCION | BAJA |

- Idempotencia: upsert por `codigo` (patrón rol GERENTE); limpiar `IncidenciaCalidad` y pares de reposición de las OPs de demo antes de recrear pares (orden de borrado: incidencias → pares, por FK).
- Driver de demo: **OP-9005** (12 pares, la misma de D5).

## 10. Fuera de alcance (futuro)

- Valoración en pesos de bajas/reprocesos (costo estándar del par vía BOM) → habilita rentabilidad real por centro de costo.
- Evidencia fotográfica y PDF/firma del acta (requiere storage externo).
- CRUD de tipos de daño por UI.
- Devoluciones / daños post-PT.
- Reproceso con retroceso físico de célula (si el cliente lo pide al ver la demo).
- Consumo real vs. referencia en Corte (briefing §Corte) — encaja en D7 con el detalle por célula.
