import { codigoReposicion, validarReporte } from './calidad-core';

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
