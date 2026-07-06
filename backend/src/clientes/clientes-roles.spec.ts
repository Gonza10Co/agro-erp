import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { ClientesController } from './clientes.controller';
import { ProductoConfiguradoController } from '../catalog/producto-configurado/producto-configurado.controller';

// Piloto (entrega 1): el CLIENTE administra su capa comercial — compradores y
// productos configurados. Estos specs fijan esa decisión de gating en backend.
describe('Gating de roles del piloto (CLIENTE)', () => {
  const reflector = new Reflector();

  it.each([['crear'], ['actualizar'], ['desactivar']])(
    'ClientesController.%s permite al CLIENTE (además de roles internos)',
    (metodo) => {
      const roles = reflector.get<string[]>(
        ROLES_KEY,
        ClientesController.prototype[metodo as keyof ClientesController] as never,
      );
      expect(roles).toEqual(expect.arrayContaining(['ADMIN', 'GERENTE', 'CLIENTE']));
      expect(roles).not.toContain('OPERARIO');
    },
  );

  it('ProductoConfiguradoController (escrituras) permite al CLIENTE', () => {
    const roles = reflector.get<string[]>(ROLES_KEY, ProductoConfiguradoController);
    expect(roles).toEqual(expect.arrayContaining(['ADMIN', 'GERENTE', 'CLIENTE']));
    expect(roles).not.toContain('OPERARIO');
  });
});
