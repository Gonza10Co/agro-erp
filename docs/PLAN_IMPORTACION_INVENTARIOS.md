# Plan de importación de inventarios reales del cliente

> Estado: **BORRADOR / bloqueado por decisiones** — 2026-07-02
> Fuente: 4 Google Sheets enviados por Juan Pablo (cuenta `inventariosagroindustrial@gmail.com`), corte **30-jun-2026**.
> Ver memoria `inventarios-reales-google-sheets` para la estructura cruda de cada sheet.

## 1. Los 4 sheets y a dónde van

| Sheet | ¿Trae cantidades? | Modelo ERP destino | ¿Calza? |
|---|---|---|---|
| Producto Terminado · `INVENTARIO` (24.533 pares) | Sí | `InventarioPT` + `MovimientoInventario` (motivo `AJUSTE_MANUAL`) | ⚠️ Casi — requiere puente marca→ProductoConfigurado |
| Almacén Cortes (9.815 pares) | Sí | WIP en célula `CORTE` → hoy solo modelable como `Par[]` | ❌ Gap de modelo |
| Guarnición · `INVENTARIO` (capelladas) | Sí | WIP en célula `GUARNICION` → `Par[]` | ❌ Gap de modelo |
| Bodega de Insumos ("CONTROL MATERIA PRIMA E INSUMOS", **9 pestañas**) | **Sí** (pestaña INVENTARIO, 301 insumos con STOCK) | `Material` + `InventarioMaterial` + `MovimientoInventario` + `Proveedor` | ✅ Rica fuente |

**Consecuencia:** PT encaja en `InventarioPT`. **Insumos SÍ trae existencias** (corregido 2026-07-02, tras releer las 9 pestañas). Cortes/Guarnición siguen siendo WIP (gap de modelo).

### Detalle Bodega de Insumos (9 pestañas)

| # | Pestaña | Filas | Destino ERP |
|---|---|---|---|
| 1 | INSUMOS | 305 | maestro/costeo → `Material` |
| 2 | PROVEEDORES | 999 | `Proveedor` / `Material.proveedorId` |
| 3 | **INVENTARIO** | 301 | `InventarioMaterial` (STOCK) + campos de costeo/centro de costo |
| 4 | ENTRADAS | 578 | `MovimientoInventario` (ENTRADA) — histórico |
| 5 | SALIDAS | 2470 | `MovimientoInventario` (SALIDA) — histórico |
| 6 | P&D | 748 | Préstamos/Devoluciones (DEBO/DEBEN) — flujo inverso, ver memoria kickoff-huecos |
| 7 | DINAMICAS | 1007 | derivado (ignorar en import) |
| 8 | REQUERIMIENTO | 901 | MRP / compras |
| 9 | FORMATO TARROS | 30 | auxiliar (ignorar) |

Columnas de INVENTARIO: `CODIGO · PRODUCTO · MEDIDA · INV.INICIAL · TOTAL ENTRADAS · TOTAL SALIDAS · STOCK · $UNITARIO · $TOTAL · COMPRAS · VENTAS · DEBO · DEBEN · CONSUMO Q · CONSUMO $ · (valorizados $) · CENTRO DE COSTO · TIPO COSTO`. `STOCK = INICIAL + ENTRADAS − SALIDAS`. Código = `P+3-4 letras+consecutivo`, llave compartida entre pestañas.

**Marquillas / Punteras / Plantillas ya están aquí como `Material`** (PMAR/PPLA/PPUN) → son insumos, NO líneas de producción, aunque el cliente las llame "líneas aparte".

## 2. Modelo ERP relevante (referencia)

- `agro-erp/backend/prisma/schema.prisma`
- Stock PT: **`InventarioPT`** — clave única `(productoConfiguradoId, tallaId, bodegaId)`, campos `cantDisponible`, `cantReservada`. Talla es entidad (`Talla`), stock en **filas por talla**.
- SKU: **`ProductoConfigurado`** = `Referencia` + `Marca` + opciones. El inventario NO se lleva por marca suelta.
- Marca: entidad **`Marca`** (`codigo` unique, `lineaId` nullable, `tipo` PROPIA|MAQUILA).
- Kardex: **`MovimientoInventario`** (`tipo` ENTRADA/SALIDA/AJUSTE, `motivo`, `cantidad` positiva, `referencia`).
- Stock MP: **`InventarioMaterial`** (1:1 con `Material`, `cantDisponible` Decimal), sin bodega ni talla.
- WIP: **`Par`** (`codigo` unique `OF{n}-{seq}`, `celulaActual`, `estado`, `tallaId`, `lineaId?`). Una fila por par físico.
- Alias legacy: existe **`MaterialAlias`** (texto Drive → material canónico). **No existe** equivalente para marcas/PT.
- Seed de datos reales: **`prisma/seed-basarili.ts`** (idempotente, upsert por código; carga catálogo/BOM, NO stock). CSVs reales en `prisma/data/basarili/` (gitignored). Utilidades en `prisma/lib/csv.ts`.
- Endpoints inventario (`src/inventario/`): `POST /inventario/pt` (upsert stock PT), `POST /inventario/material/movimiento` (movimiento MP + kardex).

## 3. Bloqueadores (decidir antes de implementar)

1. **Puente marca → ProductoConfigurado.** El sheet PT está por nombre de marca; el ERP inventaría por SKU (`ProductoConfigurado`). Hoy: 110 marcas / 5 referencias (101–105). ¿Existe un `ProductoConfigurado` por marca de inventario, o hay que generarlos? Sin esto no se puede escribir `InventarioPT`.
2. **Cortes y Guarnición = WIP.** Solo representables como `Par[]` (uno por par, con QR que aún no existe). ¿Cargar como pares semilla, como ajuste agregado, o dejar fuera del arranque?
3. **Estados como marcas.** `DAÑADOS`, `SEGUNDA(S)`, `MUESTRAS`, `USADAS`, `TROCADOS`, `DEV. EXPORTACIÓN`. `DAÑADOS` ≠ disponible; `SEGUNDA` = producto vendible de 2.ª (¿SKU aparte o flag?).
4. **Cruce de nombres.** Nombres libres del sheet ("103 ALPACA CAFÉ SUELA NARANJA") vs `Marca.codigo`. Falta tabla de alias de marca/SKU.

### Feroz / IDC — RESUELTO (audio Juan Pablo 2026-07-02)
- **Feroz = línea de producción NUEVA**, se maneja aparte con su propio inventario → agregar a entidad `Linea`.
- **IDC se descarta**: se agota lo que hay ("se inyecta y sale, muere") y no se modela como línea/marca viva.
- Juan Pablo usa "línea" también para Marquillas/Punteras/Plantillas, pero esas ya están como `Material` en la Bodega de Insumos → son insumos, NO líneas. Confirmar redacción con él, no modelar como `Linea`.

## 4. Ruta técnica recomendada

Extender `seed-basarili.ts` con nuevos CSVs (idempotentes):

```
inventario-pt.csv        → InventarioPT (upsert) + MovimientoInventario (AJUSTE_MANUAL carga inicial)
  columnas: skuOMarca, tallaValor, bodegaCodigo, cantDisponible
marca-alias.csv (nuevo)  → puente nombreSheet → Marca/ProductoConfigurado
inventario-material.csv  → InventarioMaterial (STOCK) + MovimientoInventario inicial (desde pestaña INVENTARIO)
material-costeo.csv      → update Material (valorUnitario, centroCosto, tipoCosto) desde Bodega Insumos
proveedores.csv          → Proveedor + Material.proveedorId (desde pestaña PROVEEDORES)
```

Opcional (fase 2):
- Histórico de kardex MP desde pestañas ENTRADAS/SALIDAS (reconstrucción de `MovimientoInventario`). Para el arranque basta cargar STOCK como saldo inicial (AJUSTE_MANUAL).
- Préstamos/Devoluciones (pestaña P&D, DEBO/DEBEN) → depende de si se modela el flujo inverso (ver memoria kickoff-huecos).

Pendiente hasta decisión/datos del cliente:
- WIP de Cortes/Guarnición (depende de decisión #2).
- Inventarios "aparte" que el cliente mencionó (Punteras/Marquillas/Plantillas) — pero **ya aparecen como Material en la Bodega de Insumos**; confirmar si son sub-vistas o inventarios físicos distintos.

## 5. Estado / próximos pasos

**HECHO (2026-07-02) — stock de materia prima:**
- `prisma/data/basarili/inventario-material.csv` (301 insumos, `codigo,cantDisponible`) + `.example.csv`.
- 19 insumos nuevos agregados a `materiales.csv` (plantillas kevlar por talla, marquillas, caja).
- `seed-basarili.ts` extendido con el bloque 8: carga `InventarioMaterial` (upsert por `materialId`, idempotente). Typecheck limpio.
- Pendiente de ejecución: correr el seed contra la DB (local `agro-erp-pg:5433` o Railway una vez) y verificar `GET /inventario/consolidado`.

**PENDIENTE:**
1. Ejecutar el seed y validar el stock cargado.
2. PT (`InventarioPT`): resolver puente marca→`ProductoConfigurado` (bloqueador #1) — requiere a JP.
3. WIP Cortes/Guarnición: decisión de modelado (bloqueador #2).
4. Fase de costeo (migración `Material`: costo unitario, tipo costo, stock mínimo) + proveedores (sheet sin NIT). Ver decisión #2 del chat.
5. Inventarios faltantes: Punteras/Marquillas/Plantillas (ya están como Material en Insumos; confirmar con JP).
