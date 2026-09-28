/**
 * Carga y ajuste del inventario de materia prima desde la plantilla (conteo
 * físico). Lógica pura: sin Prisma. Es el gemelo de ajuste-pt-core.ts, con dos
 * diferencias: la llave es solo el material (un saldo por material) y el conteo
 * admite decimales (metros, kilos), hasta 4 como la columna Decimal(14,4).
 *
 * Para no arrastrar errores de coma flotante (0,1 + 0,2 ≠ 0,3) todo se compara
 * y se resta en DIEZMILÉSIMAS ENTERAS: 12,5 m = 125000. Decimal(14,4) cabe de
 * sobra en un entero seguro de JS (10^14 < 2^53).
 *
 * El conteo FIJA el saldo, no lo suma. Una fila sin conteo no llega hasta aquí.
 */

export const ESCALA = 10_000;
/** Decimal(14,4): 10 dígitos enteros. */
const MAX_DIEZMILESIMAS = 10 ** 14 - 1;

export interface FilaAjusteMpEntrada {
  /** Número de fila tal como la ve la persona en Excel (el header es la 1). */
  fila: number;
  codigo: string;
  conteo: number;
}

export interface MaterialAjuste {
  id: number;
  nombre: string;
  unidad: string;
  activo: boolean;
}

/** Saldo actual en diezmilésimas enteras. */
export interface SaldoAjusteMp {
  disponible: number;
  reservado: number;
}

export interface CatalogoAjusteMp {
  /** código de material → material (activos e inactivos, para decir cuál es cuál) */
  materiales: Map<string, MaterialAjuste>;
  /** materialId → saldo. Sin entrada = el material aún no tiene fila de inventario. */
  saldos: Map<number, SaldoAjusteMp>;
}

export interface FilaAjusteMpResuelta {
  fila: number;
  codigo: string;
  material: string | null;
  unidad: string | null;
  /** En unidades del material (12.5 = 12,5 m). */
  conteo: number;
  actual: number;
  reservado: number;
  diferencia: number;
  error: string | null;
  /** Solo en filas válidas: lo que el service necesita para escribir. */
  ids?: {
    materialId: number;
    /** ¿Ya existe la fila de InventarioMaterial? Si no, se crea. */
    existe: boolean;
    actualDz: number;
    reservadoDz: number;
    conteoDz: number;
    diferenciaDz: number;
  };
}

/**
 * Número → diezmilésimas enteras, o null si trae más de 4 decimales.
 * Se cuentan los decimales sobre la representación más corta del número
 * (la que imprime JS), así 12.5 no se confunde con 12.4999999…
 */
export function aDiezmilesimas(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  const s = Math.abs(n).toString();
  // Notación exponencial: o es un entero enorme o una fracción minúscula (> 4 decimales).
  if (s.includes('e')) return Number.isInteger(n) ? n * ESCALA : null;
  const decimales = s.split('.')[1]?.length ?? 0;
  if (decimales > 4) return null;
  return Math.round(n * ESCALA);
}

/** Decimal de Prisma (o su texto) → diezmilésimas enteras, sin pasar por float. */
export function decimalADiezmilesimas(valor: { toString(): string } | number | null | undefined): number {
  if (valor === null || valor === undefined) return 0;
  const s = valor.toString().trim();
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`Cantidad ilegible: ${s}`);
  const frac = (m[3] ?? '').padEnd(4, '0').slice(0, 4);
  const abs = Number(m[2]) * ESCALA + Number(frac);
  return m[1] ? -abs : abs;
}

/** Diezmilésimas → número en unidades (para mostrar). */
export function aUnidades(dz: number): number {
  return dz / ESCALA;
}

/** Diezmilésimas → texto decimal exacto para Prisma ("12.5000"). */
export function aTextoDecimal(dz: number): string {
  const signo = dz < 0 ? '-' : '';
  const abs = Math.abs(dz);
  return `${signo}${Math.floor(abs / ESCALA)}.${String(abs % ESCALA).padStart(4, '0')}`;
}

/**
 * Valida cada fila contra el catálogo y calcula la diferencia contra el saldo
 * actual. No corta en el primer error: devuelve todas las filas con su error
 * para que la persona corrija el archivo de una sola vez.
 */
export function resolverFilasAjusteMp(
  filas: FilaAjusteMpEntrada[],
  catalogo: CatalogoAjusteMp,
): FilaAjusteMpResuelta[] {
  const vistas = new Map<number, number>();

  return filas.map((f) => {
    const codigo = f.codigo.trim();
    const base: FilaAjusteMpResuelta = {
      fila: f.fila,
      codigo,
      material: null,
      unidad: null,
      conteo: f.conteo,
      actual: 0,
      reservado: 0,
      diferencia: 0,
      error: null,
    };
    const conError = (error: string) => ({ ...base, error });

    const material = catalogo.materiales.get(codigo);
    if (!material) return conError(`El material ${codigo} no existe`);
    base.material = material.nombre;
    base.unidad = material.unidad;
    if (!material.activo) return conError(`El material ${codigo} está inactivo`);

    if (!Number.isFinite(f.conteo) || f.conteo < 0)
      return conError('El conteo debe ser un número, cero o mayor');
    const conteoDz = aDiezmilesimas(f.conteo);
    if (conteoDz === null) return conError('El conteo admite máximo 4 decimales');
    if (conteoDz > MAX_DIEZMILESIMAS) return conError('El conteo es demasiado grande');

    const repetida = vistas.get(material.id);
    if (repetida !== undefined) return conError(`Repite el mismo material de la fila ${repetida}`);
    vistas.set(material.id, f.fila);

    const saldo = catalogo.saldos.get(material.id);
    const actualDz = saldo?.disponible ?? 0;
    const reservadoDz = saldo?.reservado ?? 0;
    const diferenciaDz = conteoDz - actualDz;
    const resuelta: FilaAjusteMpResuelta = {
      ...base,
      actual: aUnidades(actualDz),
      reservado: aUnidades(reservadoDz),
      diferencia: aUnidades(diferenciaDz),
    };
    // Lo reservado ya está amarrado a pedidos: un conteo menor dejaría
    // reservas sin material detrás.
    if (conteoDz < reservadoDz)
      return {
        ...resuelta,
        error: `Hay ${String(aUnidades(reservadoDz)).replace('.', ',')} ${material.unidad} reservados para pedidos; el conteo no puede ser menor`,
      };

    return {
      ...resuelta,
      ids: {
        materialId: material.id,
        existe: saldo !== undefined,
        actualDz,
        reservadoDz,
        conteoDz,
        diferenciaDz,
      },
    };
  });
}

export interface ResumenAjusteMp {
  filas: number;
  errores: number;
  sinCambio: number;
  suben: number;
  bajan: number;
  /** Suma de lo que entra, en unidades (mezcla unidades: es solo orientativo). */
  cantidadEntra: number;
  cantidadSale: number;
}

export function resumirAjusteMp(filas: FilaAjusteMpResuelta[]): ResumenAjusteMp {
  let entraDz = 0;
  let saleDz = 0;
  const r: ResumenAjusteMp = {
    filas: filas.length,
    errores: 0,
    sinCambio: 0,
    suben: 0,
    bajan: 0,
    cantidadEntra: 0,
    cantidadSale: 0,
  };
  for (const f of filas) {
    const dif = f.ids?.diferenciaDz ?? 0;
    if (f.error) r.errores++;
    else if (dif > 0) {
      r.suben++;
      entraDz += dif;
    } else if (dif < 0) {
      r.bajan++;
      saleDz += -dif;
    } else r.sinCambio++;
  }
  r.cantidadEntra = aUnidades(entraDz);
  r.cantidadSale = aUnidades(saleDz);
  return r;
}
