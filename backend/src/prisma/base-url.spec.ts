import { describirBase, esBaseDeProduccion } from './base-url';

describe('describirBase', () => {
  it('quita usuario y clave y deja host:puerto/base', () => {
    expect(describirBase('postgresql://postgres:s3cr3t@localhost:5433/agro_erp')).toBe('localhost:5433/agro_erp');
    expect(describirBase('postgresql://u:p@shuttle.proxy.rlwy.net:58704/railway?sslmode=require')).toBe(
      'shuttle.proxy.rlwy.net:58704/railway',
    );
  });
});

describe('esBaseDeProduccion', () => {
  it('reconoce los hosts de Railway aunque la clave tenga arrobas o el puerto cambie', () => {
    expect(esBaseDeProduccion('postgresql://u:p@ss@shuttle.proxy.rlwy.net:58704/railway', undefined)).toBe(true);
    expect(esBaseDeProduccion('postgresql://u:p@postgres.railway.internal:5432/railway', undefined)).toBe(true);
  });

  it('una base local no es producción', () => {
    expect(esBaseDeProduccion('postgresql://postgres:x@localhost:5434/railway', undefined)).toBe(false);
    expect(esBaseDeProduccion('postgresql://postgres:x@127.0.0.1:5433/agro_erp', 'development')).toBe(false);
  });

  it('NODE_ENV=production cuenta como producción aunque el host sea local', () => {
    expect(esBaseDeProduccion('postgresql://postgres:x@localhost:5433/agro_erp', 'production')).toBe(true);
  });

  it('no se deja engañar por un host que solo contiene la palabra', () => {
    expect(esBaseDeProduccion('postgresql://u:p@railway-copia.local:5432/x', undefined)).toBe(false);
  });
});
