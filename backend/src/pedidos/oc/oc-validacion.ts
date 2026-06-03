export interface TallaParaValidar {
  tallaValor: number;
  cantidad: number;
  refTallaMin: number;
  refTallaMax: number;
}
export interface LineaParaValidar {
  tallas: TallaParaValidar[];
}
export interface OCParaValidar {
  estado: string;
  clienteActivo: boolean;
  lineas: LineaParaValidar[];
}

export function validarConfirmacionOC(oc: OCParaValidar): string[] {
  const errores: string[] = [];
  if (oc.estado !== 'BORRADOR')
    errores.push('La OC solo puede confirmarse desde BORRADOR');
  if (!oc.clienteActivo) errores.push('El cliente no está activo');
  if (oc.lineas.length === 0)
    errores.push('La OC debe tener al menos una línea');

  for (const linea of oc.lineas) {
    for (const t of linea.tallas) {
      if (t.tallaValor < t.refTallaMin || t.tallaValor > t.refTallaMax) {
        errores.push(
          `Talla ${t.tallaValor} fuera del rango ${t.refTallaMin}-${t.refTallaMax}`,
        );
      }
      if (t.cantidad <= 0) {
        errores.push(
          `La cantidad de la talla ${t.tallaValor} debe ser mayor a 0`,
        );
      }
    }
  }
  return errores;
}
