import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService.login', () => {
  const user = { id: 1, username: 'admin', passwordHash: 'HASH', isActive: true, role: { name: 'ADMIN' } };

  const usersService = { findByUsername: jest.fn() } as any;
  const hashing = { verify: jest.fn() } as any;
  const jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') } as any;
  const prisma = { refreshToken: { create: jest.fn().mockResolvedValue({}) } } as any;

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
    await expect(service.login({ username: 'x', password: 'y' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('lanza Unauthorized si la contraseña es incorrecta', async () => {
    usersService.findByUsername.mockResolvedValue(user);
    hashing.verify.mockResolvedValue(false);
    await expect(service.login({ username: 'admin', password: 'mala' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });
});
