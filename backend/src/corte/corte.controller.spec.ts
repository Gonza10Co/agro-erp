import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { CorteController, ROLES_PROGRAMAN_CORTE } from './corte.controller';

describe('CorteController: quién programa el corte', () => {
  const roles = (metodo: keyof CorteController) =>
    Reflect.getMetadata(ROLES_KEY, CorteController.prototype[metodo]);

  it('la gerencia y el jefe de corte cargan órdenes; nadie más', () => {
    expect(ROLES_PROGRAMAN_CORTE).toEqual(['ADMIN', 'GERENTE', 'JEFE_CORTE']);
    expect(roles('crear')).toEqual(ROLES_PROGRAMAN_CORTE);
    expect(roles('ofsDisponibles')).toEqual(ROLES_PROGRAMAN_CORTE);
  });

  it('el tablero y el registro de avance no se cierran por rol', () => {
    expect(roles('tablero')).toBeUndefined();
    expect(roles('registrarAvance')).toBeUndefined();
  });
});
