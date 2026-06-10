import { codigoReposicion, validarReporte, agruparIndicadores } from './calidad-core';

describe('codigoReposicion', () => {
  it('par base → -R1', () => {
    expect(codigoReposicion('OF12-0003')).toBe('OF12-0003-R1');
  });
  it('reposición -R1 → -R2 (cadena continua)', () => {
    expect(codigoReposicion('OF12-0003-R1')).toBe('OF12-0003-R2');
  });
  it('-R9 → -R10 (números de más de un dígito)', () => {
    expect(codigoReposicion('OF12-0003-R9')).toBe('OF12-0003-R10');
  });
  it('no confunde el sufijo numérico del código base con una reposición', () => {
    // termina en dígitos pero sin "-R": es un código base normal
    expect(codigoReposicion('OF5-0001')).toBe('OF5-0001-R1');
  });
});

describe('validarReporte', () => {
  it('REPROCESO no exige nada', () => {
    expect(validarReporte('REPROCESO', undefined, 'VENTAS')).toBeNull();
  });
  it('BAJA con rol insuficiente → ROL_INSUFICIENTE', () => {
    expect(validarReporte('BAJA', 'robot dañó capellada', 'VENTAS')).toBe('ROL_INSUFICIENTE');
  });
  it('BAJA sin descripción → SIN_DESCRIPCION (gerente)', () => {
    expect(validarReporte('BAJA', undefined, 'GERENTE')).toBe('SIN_DESCRIPCION');
    expect(validarReporte('BAJA', '   ', 'GERENTE')).toBe('SIN_DESCRIPCION');
  });
  it('BAJA válida con GERENTE y con ADMIN → null', () => {
    expect(validarReporte('BAJA', 'acta x', 'GERENTE')).toBeNull();
    expect(validarReporte('BAJA', 'acta x', 'ADMIN')).toBeNull();
  });
});

describe('agruparIndicadores', () => {
  const inc = (codigo: string, nombre: string, celulaCausante: any, clase: any) => ({
    tipoDano: { codigo, nombre, celulaCausante, clase },
  });

  it('agrupa por célula CAUSANTE (no por detección) y separa bajas de reprocesos', () => {
    const incidencias = [
      inc('STROBEL-RASGADO', 'Strobel rasgado', 'GUARNICION', 'REPROCESO'),
      inc('STROBEL-RASGADO', 'Strobel rasgado', 'GUARNICION', 'REPROCESO'),
      inc('DANO-ROBOT', 'Daño de robot', 'INYECCION', 'BAJA'),
    ];
    const { centros } = agruparIndicadores(incidencias, { GUARNICION: 10, INYECCION: 4 });
    const guar = centros.find((c) => c.celula === 'GUARNICION')!;
    expect(guar).toMatchObject({ total: 2, bajas: 0, reprocesos: 2, paresProcesados: 10, pctDano: 0.2 });
    const iny = centros.find((c) => c.celula === 'INYECCION')!;
    expect(iny).toMatchObject({ total: 1, bajas: 1, reprocesos: 0, pctDano: 0.25 });
  });

  it('siempre devuelve los 4 centros de costo, con pctDano null si no hubo pares procesados', () => {
    const { centros } = agruparIndicadores([], {});
    expect(centros.map((c) => c.celula)).toEqual(['CORTE', 'GUARNICION', 'ALMACEN', 'INYECCION']);
    expect(centros.every((c) => c.total === 0 && c.pctDano === null)).toBe(true);
  });

  it('topDanos ordena por frecuencia y corta en 5', () => {
    const incidencias = [
      ...Array(3).fill(inc('A', 'A', 'CORTE', 'BAJA')),
      ...Array(5).fill(inc('B', 'B', 'CORTE', 'REPROCESO')),
      inc('C', 'C', 'GUARNICION', 'REPROCESO'),
      inc('D', 'D', 'GUARNICION', 'REPROCESO'),
      inc('E', 'E', 'INYECCION', 'BAJA'),
      inc('F', 'F', 'INYECCION', 'BAJA'),
    ];
    const { topDanos } = agruparIndicadores(incidencias, {});
    expect(topDanos).toHaveLength(5);
    expect(topDanos[0]).toMatchObject({ codigo: 'B', total: 5 });
    expect(topDanos[1]).toMatchObject({ codigo: 'A', total: 3 });
  });
});
