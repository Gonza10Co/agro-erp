import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const prisma = {
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    role: { findUnique: jest.fn(), findMany: jest.fn() },
    refreshToken: { deleteMany: jest.fn() },
  } as any;
  const hashing = {
    hash: jest.fn().mockResolvedValue('HASH'),
    verify: jest.fn(),
  } as any;
  const service = new UsersService(prisma, hashing);

  const ADMIN = { id: 1, name: 'ADMIN' };
  const GERENTE = { id: 2, name: 'GERENTE' };

  beforeEach(() => {
    jest.clearAllMocks();
    hashing.hash.mockResolvedValue('HASH');
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
  });

  describe('crear', () => {
    it('guarda la contraseña hasheada, nunca en claro', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue(GERENTE);
      prisma.user.create.mockResolvedValue({ id: 5, username: 'jp' });

      await service.crear({ username: 'jp', password: 'secreto123', roleId: 2 });

      expect(hashing.hash).toHaveBeenCalledWith('secreto123');
      const data = prisma.user.create.mock.calls[0][0].data;
      expect(data.passwordHash).toBe('HASH');
      expect(JSON.stringify(data)).not.toContain('secreto123');
    });

    it('no devuelve el passwordHash al front', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue(GERENTE);
      prisma.user.create.mockResolvedValue({ id: 5 });

      await service.crear({ username: 'jp', password: 'secreto123', roleId: 2 });

      const select = prisma.user.create.mock.calls[0][0].select;
      expect(select.passwordHash).toBeUndefined();
      expect(select.username).toBe(true);
    });

    it('rechaza username duplicado', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, username: 'jp' });
      await expect(
        service.crear({ username: 'jp', password: 'secreto123', roleId: 2 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rechaza un rol inexistente', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue(null);
      await expect(
        service.crear({ username: 'x', password: 'secreto123', roleId: 99 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('actualizar', () => {
    it('desactiva a otro usuario y le revoca las sesiones abiertas', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 7,
        isActive: true,
        roleId: 2,
        role: GERENTE,
      });
      prisma.user.update.mockResolvedValue({ id: 7, isActive: false });

      await service.actualizar(7, { isActive: false }, 1);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 7 } }),
      );
      // Sin esto, quien se va sigue entrando con su refresh token hasta que expire.
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 7 },
      });
    });

    it('NO revoca sesiones cuando solo se cambia el rol', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 7,
        isActive: true,
        roleId: 2,
        role: GERENTE,
      });
      prisma.user.update.mockResolvedValue({ id: 7 });

      await service.actualizar(7, { roleId: 3 }, 1);

      expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
    });

    it('impide que un admin se desactive a sí mismo', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        isActive: true,
        roleId: 1,
        role: ADMIN,
      });
      await expect(
        service.actualizar(1, { isActive: false }, 1),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('impide que un admin se cambie su propio rol', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        isActive: true,
        roleId: 1,
        role: ADMIN,
      });
      await expect(
        service.actualizar(1, { roleId: 2 }, 1),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('impide desactivar al ÚLTIMO admin activo', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 3,
        isActive: true,
        roleId: 1,
        role: ADMIN,
      });
      prisma.user.count.mockResolvedValue(0); // no queda otro admin vivo

      await expect(
        service.actualizar(3, { isActive: false }, 1),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('deja desactivar a un admin si queda otro activo', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 3,
        isActive: true,
        roleId: 1,
        role: ADMIN,
      });
      prisma.user.count.mockResolvedValue(1);
      prisma.user.update.mockResolvedValue({ id: 3, isActive: false });

      await expect(
        service.actualizar(3, { isActive: false }, 1),
      ).resolves.toMatchObject({ id: 3 });
    });

    it('impide degradar de rol al último admin (no solo desactivarlo)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 3,
        isActive: true,
        roleId: 1,
        role: ADMIN,
      });
      prisma.user.count.mockResolvedValue(0);

      await expect(
        service.actualizar(3, { roleId: 2 }, 1),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lanza NotFound si el usuario no existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.actualizar(99, { isActive: false }, 1),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('resetearPassword', () => {
    it('hashea la nueva y mata las sesiones vivas', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 7 });
      prisma.user.update.mockResolvedValue({ id: 7 });

      await service.resetearPassword(7, { password: 'nuevaClave1' });

      expect(hashing.hash).toHaveBeenCalledWith('nuevaClave1');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { passwordHash: 'HASH' },
      });
      // Si se resetea porque se filtró, la sesión abierta con la vieja debe morir.
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 7 },
      });
    });

    it('lanza NotFound si el usuario no existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.resetearPassword(99, { password: 'nuevaClave1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listar', () => {
    it('nunca expone el passwordHash', () => {
      prisma.user.findMany.mockReturnValue([]);
      service.listar();
      const select = prisma.user.findMany.mock.calls[0][0].select;
      expect(select.passwordHash).toBeUndefined();
      expect(select.role).toEqual({ select: { id: true, name: true } });
    });
  });
});
