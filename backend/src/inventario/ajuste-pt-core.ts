/**
 * Carga y ajuste del inventario de producto terminado desde la plantilla
 * (conteo físico). Lógica pura: sin Prisma. El service arma el catálogo y los
 * saldos; aquí se decide qué fila es válida y cuánto cambia cada saldo.
 *
 * El conteo FIJA el saldo, no lo suma: la plantilla trae lo que hay y la persona
 * escribe lo que contó. Una fila sin conteo no se toca.
 */

export type CalidadAjuste = 'PRIMERA' | 'SEGUNDA';
const CALIDADES: CalidadAjuste[] = ['PRIMERA', 'SEGUNDA'];

export interface FilaAjusteEntrada {
  /** Número de fila tal como la ve la persona en Excel (el header es la 1). */
  fila: number;
  codigo: string;
  talla: number;
  bodega: string;
  calidad: string;
  conteo: number;
}

export interface ProductoAjuste {
  id: number;
  nombre: string;
  tallaMin: number;
  tallaMax: number;
}

export interface SaldoAjuste {
  disponible: number;
  reservado: number;
}

export interface CatalogoAjuste {
  productos: Map<string, ProductoAjuste>;
  /** valor de talla → id */
  tallas: Map<number, number>;
  /** código de bodega → id */
  bodegas: Map<string, number>;
  /** clave `productoId|tallaId|bodegaId|calidad` → saldo actual */
  saldos: Map<string, SaldoAjuste>;
}

export interface FilaAjusteResuelta {
  fila: number;
  codigo: string;
  producto: string | null;
  talla: number;
  bodega: string;
  calidad: string;
  conteo: number;
  actual: number;
  reservado: number;
  diferencia: number;
  error: string | null;
  /** Ids resueltos; solo presentes cuando la fila es válida. */
  ids?: {
    productoConfiguradoId: number;
    tallaId: number;
    bodegaId: number;
    calidad: CalidadAjuste;
  };
}

export function claveSaldo(
  productoId: number,
  tallaId: number,
  bodegaId: number,
  calidad: string,
): string {
  return `${productoId}|${tallaId}|${bodegaId}|${calidad}`;
}

/**
 * Valida cada fila contra el catálogo y calcula la diferencia contra el saldo
 * actual. No corta en el primer error: devuelve todas las filas con su error
 * para que la persona corrija el archivo de una sola vez.
 */
export function resolverFilasAjuste(
  filas: FilaAjusteEntrada[],
  catalogo: CatalogoAjuste,
): FilaAjusteResuelta[] {
  const vistas = new Map<string, number>();

  return filas.map((f) => {
    const codigo = f.codigo.trim();
    const bodega = f.bodega.trim().toUpperCase();
    const calidad = f.calidad.trim().toUpperCase() || 'PRIMERA';
    const base: FilaAjusteResuelta = {
      fila: f.fila,
      codigo,
      producto: null,
      talla: f.talla,
      bodega,
      calidad,
      conteo: f.conteo,
      actual: 0,
      reservado: 0,
      diferencia: 0,
      error: null,
    };
    const conError = (error: string) => ({ ...base, error });

    const producto = catalogo.productos.get(codigo);
    if (!producto) return conError(`El producto ${codigo} no existe o está inactivo`);
    base.producto = producto.nombre;

    if (!Number.isInteger(f.conteo) || f.conteo < 0)
      return conError('El conteo debe ser un número entero, cero o mayor');
    if (!CALIDADES.includes(calidad as CalidadAjuste))
      return conError(`Calidad "${f.calidad}" no válida: use PRIMERA o SEGUNDA`);

    const tallaId = catalogo.tallas.get(f.talla);
    if (tallaId === undefined) return conError(`La talla ${f.talla} no existe`);
    if (f.talla < producto.tallaMin || f.talla > producto.tallaMax)
      return conError(
        `La talla ${f.talla} está fuera del rango de la referencia (${producto.tallaMin} a ${producto.tallaMax})`,
      );

    const bodegaId = catalogo.bodegas.get(bodega);
    if (bodegaId === undefined) return conError(`La bodega ${bodega} no existe o está inactiva`);

    const clave = claveSaldo(producto.id, tallaId, bodegaId, calidad);
    const repetida = vistas.get(clave);
    if (repetida !== undefined)
      return conError(`Repite el mismo producto, talla, bodega y calidad de la fila ${repetida}`);
    vistas.set(clave, f.fila);

    const saldo = catalogo.saldos.get(clave) ?? { disponible: 0, reservado: 0 };
    const resuelta: FilaAjusteResuelta = {
      ...base,
      actual: saldo.disponible,
      reservado: saldo.reservado,
      diferencia: f.conteo - saldo.disponible,
    };
    // Lo reservado ya está prometido a pedidos: un conteo menor dejaría
    // reservas sin botas detrás.
    if (f.conteo < saldo.reservado)
      return {
        ...resuelta,
        error: `Hay ${saldo.reservado} pares reservados para pedidos; el conteo no puede ser menor`,
      };

    return {
      ...resuelta,
      ids: {
        productoConfiguradoId: producto.id,
        tallaId,
        bodegaId,
        calidad: calidad as CalidadAjuste,
      },
    };
  });
}

export interface ResumenAjuste {
  filas: number;
  errores: number;
  sinCambio: number;
  suben: number;
  bajan: number;
  paresEntran: number;
  paresSalen: number;
}

export function resumirAjuste(filas: FilaAjusteResuelta[]): ResumenAjuste {
  const r: ResumenAjuste = {
    filas: filas.length,
    errores: 0,
    sinCambio: 0,
    suben: 0,
    bajan: 0,
    paresEntran: 0,
    paresSalen: 0,
  };
  for (const f of filas) {
    if (f.error) r.errores++;
    else if (f.diferencia > 0) {
      r.suben++;
      r.paresEntran += f.diferencia;
    } else if (f.diferencia < 0) {
      r.bajan++;
      r.paresSalen += -f.diferencia;
    } else r.sinCambio++;
  }
  return r;
}
