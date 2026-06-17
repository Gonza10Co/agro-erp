# Carga de datos reales (Basarili / Botas Agroindustrial)

Esta carpeta contiene los CSVs con el **catálogo real** del cliente, exportado del
Google Drive. Los `*.csv` reales **NO se versionan** (datos sensibles, ver `.gitignore`);
solo se versionan las plantillas `*.example.csv` que documentan el formato.

El cargador es `backend/prisma/seed-basarili.ts`. Se corre con:

```bash
npm run seed:basarili      # idempotente: se puede correr varias veces
```

## Archivos esperados (en orden de dependencia)

| Archivo | Columnas | Notas |
|---|---|---|
| `tallas.csv` | `valor,orden` | Rango operativo (33–47). |
| `unidades.csv` | `codigo,nombre` | Unidad de medida (M, PAR, KG…). |
| `categorias.csv` | `nombre` | Categoría/proceso del material. |
| `marcas.csv` | `codigo,nombre,tipo` | `tipo` = PROPIA \| MAQUILA. |
| `materiales.csv` | `codigo,nombreCanonico,categoria,unidad,origen,claseBom,alias` | `origen` = COMPRADO \| FABRICADO; `claseBom` = DIRECTO_CURVA \| DIRECTO_FIJO \| INDIRECTO; `alias` = textos legados separados por `;`. |
| `referencias.csv` | `codigo,nombreInterno,tallaMin,tallaMax` | `tallaMin/Max` = valores de talla. |
| `bom-fijo.csv` | `referencia,material,consumoFijo,mermaPct` | Líneas FIJO. `material` = código del catálogo. |
| `bom-curva.csv` | `referencia,material,talla,consumo` | Líneas CURVA (un consumo por talla). |

## Estado de la carga actual (junio 2026)

Volcado del Drive: **15 tallas · 14 unidades · 7 categorías · 110 marcas · 319 materiales
(287 del catálogo de insumos + 32 directos del MRP) · 5 referencias (101–105) · 5 BOMs**.

⚠️ **El MRP del Drive no trae consumos** — solo la asignación material↔referencia.
Por eso `bom-fijo.csv` se generó con `consumoFijo = 1` como **placeholder**. Los
consumos reales se capturan en la app con el **editor de BOM** (módulo Maestros).

> Producción (Railway): el `Dockerfile` solo corre `migrate deploy`. El `seed:basarili`
> se ejecuta **manualmente una vez** contra la base de producción, no en cada deploy.
