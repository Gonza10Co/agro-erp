import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService.login', () => {
  const user = {
    id: 1,
    username: 'admin',
    passwordHash: 'HASH',
    isActive: true,
    role: { name: 'ADMIN' },
  };

  const usersService = { findByUsername: jest.fn() } as any;
  const hashing = { verify: jest.fn() } as any;
  const jwt = {
    signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
  } as any;
  const prisma = {
    refreshToken: { create: jest.fn().mockResolvedValue({}) },
  } as any;

  const service = new AuthService(usersService, hashing, jwt, prisma);

  beforeEach(() => jest.clearAllMocks());

  it('devuelve tokens cuando las credenciales son válidas', async () => {
    usersService.findByUsername.mockResolvedValue(user);
    hashing.verify.mockResolvedValue(true);

    const result = await service.login({ username: 'admin', password: 'ok' });

    expect(result.accessToken).toBe('signed.jwt.token');
    expect(result.refreshToken).toBe('signed.jwt.token');
    expect(prisma.refreshToken.create).toHaveBeenCalled();
  });

  it('lanza Unauthorized si el usuario no existe', async () => {
    usersService.findByUsername.mockResolvedValue(null);
    await expect(
      service.login({ username: 'x', password: 'y' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('lanza Unauthorized si la contraseña es incorrecta', async () => {
    usersService.findByUsername.mockResolvedValue(user);
    hashing.verify.mockResolvedValue(false);
    await expect(
      service.login({ username: 'admin', password: 'mala' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('AuthService.refresh', () => {
  const user = {
    id: 7,
    username: 'montaje',
    isActive: true,
    role: { name: 'OPERARIO' },
  };
  const ahora = new Date();

  function armar(opts: {
    payload?: any;
    usuario?: any;
    filas?: any[];
    coincide?: (hash: string) => boolean;
  }) {
    const usersService = {
      findById: jest.fn().mockResolvedValue(opts.usuario ?? user),
    } as any;
    const jwt = {
      verifyAsync: jest.fn().mockImplementation(async () => {
        if (opts.payload === 'invalido') throw new Error('jwt malformed');
        return opts.payload ?? { sub: 7 };
      }),
      signAsync: jest.fn().mockResolvedValue('nuevo.jwt'),
    } as any;
    const prisma = {
      refreshToken: {
        findMany: jest.fn().mockResolvedValue(opts.filas ?? []),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
    } as any;
    const verificar = opts.coincide ?? (() => true);
    const argon = jest.requireActual('argon2');
    jest.spyOn(argon, 'verify').mockImplementation(async (h: any) => verificar(h));
    const service = new AuthService(usersService, {} as any, jwt, prisma);
    return { service, prisma, usersService };
  }

  afterEach(() => jest.restoreAllMocks());

  it('rota el token: revoca el usado y entrega un par nuevo', async () => {
    const { service, prisma } = armar({
      filas: [{ id: 1, tokenHash: 'H1', revokedAt: null }],
    });
    const r = await service.refresh('viejo.refresh');
    expect(r).toEqual({ accessToken: 'nuevo.jwt', refreshToken: 'nuevo.jwt' });
    expect(prisma.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.refreshToken.create).toHaveBeenCalled();
  });

  it('acepta un token recién rotado (dos pestañas refrescando a la vez)', async () => {
    const { service, prisma } = armar({
      filas: [{ id: 1, tokenHash: 'H1', revokedAt: new Date(ahora.getTime() - 5_000) }],
    });
    await expect(service.refresh('viejo.refresh')).resolves.toBeDefined();
    expect(prisma.refreshToken.update).not.toHaveBeenCalled();
  });

  it('rechaza un token revocado hace rato', async () => {
    const { service } = armar({
      filas: [{ id: 1, tokenHash: 'H1', revokedAt: new Date(ahora.getTime() - 10 * 60_000) }],
    });
    await expect(service.refresh('viejo.refresh')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza un JWT inválido o vencido', async () => {
    const { service } = armar({ payload: 'invalido' });
    await expect(service.refresh('basura')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza si el usuario fue desactivado', async () => {
    const { service } = armar({
      usuario: { ...user, isActive: false },
      filas: [{ id: 1, tokenHash: 'H1', revokedAt: null }],
    });
    await expect(service.refresh('viejo.refresh')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza si ningún hash guardado coincide', async () => {
    const { service } = armar({
      filas: [{ id: 1, tokenHash: 'H1', revokedAt: null }],
      coincide: () => false,
    });
    await expect(service.refresh('otro.refresh')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
