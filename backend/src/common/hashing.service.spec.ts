import { HashingService } from './hashing.service';

describe('HashingService', () => {
  const service = new HashingService();

  it('hashea y verifica correctamente una contraseña', async () => {
    const hash = await service.hash('secreto123');
    expect(hash).not.toEqual('secreto123');
    expect(await service.verify(hash, 'secreto123')).toBe(true);
  });

  it('falla la verificación con contraseña incorrecta', async () => {
    const hash = await service.hash('secreto123');
    expect(await service.verify(hash, 'otra')).toBe(false);
  });
});
