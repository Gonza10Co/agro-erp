import {
  CalidadPT,
  InventarioConsolidado,
  MaterialStock,
  PtStock,
  WipCelula,
  WipDetailRow,
} from '../../core/api/models/inventario.models';
import { LABEL_CELULA } from '../../core/api/models/fabricacion.models';
import { Celda, Hoja, celdaFecha } from '../../shared/xlsx/xlsx-mini';

/**
 * Excel de inventarios (pedido del 2026-11-21: JP, Valentina y Juan José). Lo que se
 * ve en pantalla con los mismos filtros: el resumen, la bodega de botas en matriz
 * referencia × talla (como llevan ellos su Excel), el listado plano de botas, la
 * materia prima y lo que está en proceso. Las hojas planas son tablas para Power
 * Query: una fila de encabezados y datos debajo.
 *
 * Existencia = lo que hay físicamente (incluye lo amarrado). Libre = existencia − amarrado.
 */

export interface InventoryFilters {
  lineaId: number | null;
  /** Nombre de la línea elegida, para el resumen. */
  lineaNombre?: string | null;
  texto: string;
  bodega: string | null;
  calidad: CalidadPT | null;
}

export const FILTROS_VACIOS: InventoryFilters = { lineaId: null, texto: '', bodega: null, calidad: null };

export const COLUMNAS_PT = [
  'Fecha de corte', 'Bodega', 'Línea', 'Referencia', 'Marca', 'Producto', 'Código', 'Calidad', 'Talla',
  'Existencia', 'Amarrado', 'Libre',
];
export const COLUMNAS_MP = [
  'Fecha de corte', 'Código', 'Material', 'Categoría', 'Unidad', 'Existencia', 'Amarrado', 'Libre',
];
export const COLUMNAS_WIP = [
  'Fecha de corte', 'Célula', 'OF', 'Línea', 'Referencia', 'Marca', 'Producto', 'Código', 'Calidad', 'Talla', 'Pares',
];
const COLUMNAS_MATRIZ_IZQ = ['Referencia', 'Marca', 'Línea', 'Producto', 'Código', 'Calidad'];

const LABEL_CALIDAD: Record<CalidadPT, string> = { PRIMERA: 'Primera', SEGUNDA: 'Segunda' };

const normalizar = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function coincide(texto: string, campos: (string | number | null | undefined)[]): boolean {
  const t = normalizar(texto);
  if (!t) return true;
  return campos.some((c) => c != null && normalizar(String(c)).includes(t));
}

const redondear = (n: number) => Math.round(n * 10_000) / 10_000;

export function filterMaterials(materiales: MaterialStock[], f: InventoryFilters): MaterialStock[] {
  return materiales.filter((m) => coincide(f.texto, [m.codigo, m.nombre, m.categoria]));
}

/** La línea de la bodega PT sale de la marca: si se filtra por línea, la que no tiene línea no entra. */
export function filterPt(pt: PtStock[], f: InventoryFilters): PtStock[] {
  return pt.filter(
    (p) =>
      (f.lineaId == null || p.lineaId === f.lineaId) &&
      (f.bodega == null || p.bodega === f.bodega) &&
      (f.calidad == null || p.calidad === f.calidad) &&
      coincide(f.texto, [p.codigo, p.producto, p.referencia, p.marca]),
  );
}

/** El WIP ya llega filtrado por línea desde el backend; acá solo aplica la búsqueda. */
export function filterWip(rows: WipDetailRow[], f: InventoryFilters): WipDetailRow[] {
  return rows.filter((w) =>
    coincide(f.texto, [w.codigo, w.producto, w.referencia, w.marca, w.of == null ? null : `OF-${w.of}`]),
  );
}

/** Fecha y hora en Colombia (UTC-5): 'YYYY-MM-DD HH:mm'. */
export function corteColombia(ahora: Date): { dia: string; diaHora: string } {
  const iso = new Date(ahora.getTime() - 5 * 3_600_000).toISOString();
  return { dia: iso.slice(0, 10), diaHora: `${iso.slice(0, 10)} ${iso.slice(11, 16)}` };
}

/** 'inventarios 2026-11-21.xlsx', con el día en hora Colombia. */
export function inventoryFileName(ahora = new Date()): string {
  return `inventarios ${corteColombia(ahora).dia}.xlsx`;
}

const encabezado = (cols: string[]): Celda[] => cols.map((t) => ({ v: t, estilo: 'encabezado' }));
const negrita = (v: string | number | null): Celda => ({ v, estilo: 'negrita' });

export interface InventoryExportInput {
  data: InventarioConsolidado;
  wip: WipDetailRow[];
  filtros: InventoryFilters;
  ahora?: Date;
}

export function inventorySheets({ data, wip, filtros, ahora = new Date() }: InventoryExportInput): Hoja[] {
  const corte = corteColombia(ahora);
  const fecha = celdaFecha(corte.dia);
  const pt = filterPt(data.pt ?? [], filtros);
  const mp = filterMaterials(data.materiales ?? [], filtros);
  const enProceso = filterWip(wip, filtros);

  return [
    hojaResumen(corte.diaHora, filtros, pt, mp, enProceso, data.wip ?? []),
    hojaMatrizPt(pt),
    {
      nombre: 'PT detalle',
      filas: [
        encabezado(COLUMNAS_PT),
        ...pt.map((p) => [
          fecha, p.bodega, p.linea ?? null, p.referencia ?? null, p.marca ?? null, p.producto, p.codigo,
          LABEL_CALIDAD[p.calidad] ?? p.calidad, p.talla,
          p.cantDisponible, p.cantReservada, p.cantDisponible - p.cantReservada,
        ]),
      ],
      anchos: [12, 16, 12, 11, 18, 34, 14, 9, 7, 11, 11, 11],
      congelar: { filas: 1 },
    },
    {
      nombre: 'Materia prima',
      filas: [
        encabezado(COLUMNAS_MP),
        ...mp.map((m) => {
          const amarrado = m.cantReservada ?? 0;
          return [
            fecha, m.codigo, m.nombre, m.categoria ?? null, m.unidad,
            m.cantDisponible, amarrado, redondear(m.cantDisponible - amarrado),
          ];
        }),
      ],
      anchos: [12, 14, 40, 18, 8, 12, 12, 12],
      congelar: { filas: 1 },
    },
    {
      nombre: 'En proceso',
      filas: [
        encabezado(COLUMNAS_WIP),
        ...enProceso.map((w) => [
          fecha, LABEL_CELULA[w.celula] ?? w.celula, w.of == null ? null : `OF-${w.of}`, w.linea, w.referencia,
          w.marca, w.producto, w.codigo, LABEL_CALIDAD[w.calidad] ?? w.calidad, w.talla, w.pares,
        ]),
      ],
      anchos: [12, 13, 8, 12, 11, 18, 34, 14, 9, 7, 8],
      congelar: { filas: 1 },
    },
  ];
}

function hojaResumen(
  diaHora: string,
  f: InventoryFilters,
  pt: PtStock[],
  mp: MaterialStock[],
  wip: WipDetailRow[],
  wipCelulas: WipCelula[],
): Hoja {
  const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const existencia = suma(pt.map((p) => p.cantDisponible));
  const amarrado = suma(pt.map((p) => p.cantReservada));
  const filas: Celda[][] = [
    [{ v: 'Inventarios', estilo: 'titulo' }],
    ['Fecha de corte', diaHora],
    [],
    [negrita('Filtros')],
    ['Línea', f.lineaId == null ? 'Todas las líneas' : f.lineaNombre ?? `Línea ${f.lineaId}`],
    ['Búsqueda', f.texto.trim() || 'Sin búsqueda'],
    ['Bodega', f.bodega ?? 'Todas'],
    ['Calidad', f.calidad ? LABEL_CALIDAD[f.calidad] : 'Todas'],
    [{ v: 'La materia prima no se separa por línea. La línea de las botas en bodega es la de su marca.', estilo: 'tenue' }],
    [],
    [negrita('Producto terminado (pares)')],
    ['Existencia', existencia],
    ['Amarrado a pedidos', amarrado],
    ['Libre', existencia - amarrado],
    [],
    [negrita('Materia prima')],
    ['Materiales con saldo', mp.filter((m) => m.cantDisponible !== 0).length],
    [],
    [negrita('En proceso (pares por célula)')],
  ];
  // Con búsqueda el conteo sale del detalle filtrado; sin ella, del consolidado de pantalla.
  const porCelula = new Map<string, number>();
  for (const w of wip) porCelula.set(w.celula, (porCelula.get(w.celula) ?? 0) + w.pares);
  for (const c of wipCelulas) {
    filas.push([LABEL_CELULA[c.celula] ?? c.celula, f.texto.trim() ? porCelula.get(c.celula) ?? 0 : c.pares]);
  }
  return { nombre: 'Resumen', filas, anchos: [30, 22] };
}

/**
 * Matriz referencia × talla de la bodega PT: una fila por producto y calidad (las
 * bodegas se suman), una columna por talla con existencia y el total. Abajo, el
 * total por talla.
 */
export function hojaMatrizPt(pt: PtStock[]): Hoja {
  const tallas = [...new Set(pt.map((p) => p.talla))].sort((a, b) => a - b);
  const filas = new Map<string, { base: PtStock; porTalla: Map<number, number> }>();
  for (const p of pt) {
    const k = `${p.codigo}|${p.calidad}`;
    let f = filas.get(k);
    if (!f) filas.set(k, (f = { base: p, porTalla: new Map() }));
    f.porTalla.set(p.talla, (f.porTalla.get(p.talla) ?? 0) + p.cantDisponible);
  }
  const orden = [...filas.values()].sort(
    (a, b) =>
      (a.base.referencia ?? '').localeCompare(b.base.referencia ?? '', 'es', { numeric: true }) ||
      (a.base.marca ?? '').localeCompare(b.base.marca ?? '') ||
      a.base.codigo.localeCompare(b.base.codigo) ||
      a.base.calidad.localeCompare(b.base.calidad),
  );

  const cuerpo: Celda[][] = orden.map(({ base, porTalla }) => {
    const valores = tallas.map((t) => porTalla.get(t) ?? null);
    const total = valores.reduce<number>((a, v) => a + (v ?? 0), 0);
    return [
      base.referencia ?? null, base.marca ?? null, base.linea ?? null, base.producto, base.codigo,
      LABEL_CALIDAD[base.calidad] ?? base.calidad, ...valores, negrita(total),
    ];
  });
  const totalesTalla = tallas.map((t) =>
    negrita(pt.filter((p) => p.talla === t).reduce((a, p) => a + p.cantDisponible, 0)),
  );
  const granTotal = pt.reduce((a, p) => a + p.cantDisponible, 0);

  return {
    nombre: 'PT por talla',
    filas: [
      encabezado([...COLUMNAS_MATRIZ_IZQ, ...tallas.map(String), 'Total']),
      ...cuerpo,
      ...(cuerpo.length ? [[negrita('Total'), null, null, null, null, null, ...totalesTalla, negrita(granTotal)]] : []),
    ],
    anchos: [11, 18, 12, 34, 14, 9, ...tallas.map(() => 6), 9],
    congelar: { filas: 1, columnas: COLUMNAS_MATRIZ_IZQ.length },
  };
}
