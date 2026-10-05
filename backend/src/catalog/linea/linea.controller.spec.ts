import { LineaController } from './linea.controller';

const lineaCompleta = {
  id: 1,
  codigo: 'BASARILI',
  nombre: 'Basarili',
  celulaInicial: 'CORTE',
  subPasoInicial: null,
  activo: true,
  razonSocial: 'Basarili SAS',
  nit: '900.000.000-1',
  datosPago: 'Cuenta 123',
};

function controlador() {
  const service: any = { listar: jest.fn().mockResolvedValue([lineaCompleta]) };
  return { service, ctrl: new LineaController(service) };
}

describe('LineaController.listar', () => {
  it('a JEFE_CORTE solo le manda id, código, nombre y activo', async () => {
    const { ctrl } = controlador();
    const res = await ctrl.listar({ user: { role: 'JEFE_CORTE' } });
    expect(res).toEqual([{ id: 1, codigo: 'BASARILI', nombre: 'Basarili', activo: true }]);
  });

  it('a los demás roles les manda la línea completa', async () => {
    for (const role of ['ADMIN', 'GERENTE', 'CLIENTE', 'STAGE', 'OPERARIO']) {
      const { ctrl } = controlador();
      const res: any = await ctrl.listar({ user: { role } });
      expect(res).toEqual([lineaCompleta]);
    }
  });

  it('respeta incluirInactivas', async () => {
    const { ctrl, service } = controlador();
    await ctrl.listar({ user: { role: 'JEFE_CORTE' } }, true);
    expect(service.listar).toHaveBeenCalledWith(true);
  });
});
