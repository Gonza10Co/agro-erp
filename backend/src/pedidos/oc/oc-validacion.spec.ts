import { validarConfirmacionOC, OCParaValidar } from './oc-validacion';

const base: OCParaValidar = {
  estado: 'BORRADOR',
  clienteActivo: true,
  lineas: [
    {
      tallas: [
        { tallaValor: 40, cantidad: 10, refTallaMin: 34, refTallaMax: 46 },
      ],
    },
  ],
};

describe('validarConfirmacionOC', () => {
  it('OC válida no produce errores', () => {
    expect(validarConfirmacionOC(base)).toEqual([]);
  });

  it('rechaza si la OC no está en BORRADOR', () => {
    expect(validarConfirmacionOC({ ...base, estado: 'CONFIRMADA' })).toContain(
      'La OC solo puede confirmarse desde BORRADOR',
    );
  });

  it('rechaza cliente inactivo', () => {
    expect(validarConfirmacionOC({ ...base, clienteActivo: false })).toContain(
      'El cliente no está activo',
    );
  });

  it('rechaza OC sin líneas', () => {
    expect(validarConfirmacionOC({ ...base, lineas: [] })).toContain(
      'La OC debe tener al menos una línea',
    );
  });

  it('rechaza talla fuera del rango de la referencia', () => {
    const oc: OCParaValidar = {
      ...base,
      lineas: [
        {
          tallas: [
            { tallaValor: 50, cantidad: 5, refTallaMin: 34, refTallaMax: 46 },
          ],
        },
      ],
    };
    expect(validarConfirmacionOC(oc)).toContain(
      'Talla 50 fuera del rango 34-46',
    );
  });

  it('rechaza cantidad no positiva', () => {
    const oc: OCParaValidar = {
      ...base,
      lineas: [
        {
          tallas: [
            { tallaValor: 40, cantidad: 0, refTallaMin: 34, refTallaMax: 46 },
          ],
        },
      ],
    };
    expect(validarConfirmacionOC(oc)).toContain(
      'La cantidad de la talla 40 debe ser mayor a 0',
    );
  });
});
