import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HashingService } from '../common/hashing.service';
import { CrearUsuarioDto } from './dto/crear-usuario.dto';
import { ActualizarUsuarioDto } from './dto/actualizar-usuario.dto';
import { ResetearPasswordDto } from './dto/resetear-password.dto';

/**
 * Proyección segura: TODA lectura que salga por la API pasa por acá. El
 * `passwordHash` nunca viaja al front — ni siquiera al ADMIN.
 */
const SELECT_USUARIO = {
  id: true,
  username: true,
  isActive: true,
  createdAt: true,
  role: { select: { id: true, name: true } },
} as const;

const ROL_ADMIN = 'ADMIN';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashing: HashingService,
  ) {}

  // ── Lecturas internas del login (incluyen el hash a propósito) ──────────
  findByUsername(username: string) {
    return this.prisma.user.findUnique({
      where: { username },
      include: { role: true },
    });
  }

  findById(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
  }

  // ── ABM ────────────────────────────────────────────────────────────────
  listar() {
    return this.prisma.user.findMany({
      select: SELECT_USUARIO,
      orderBy: { username: 'asc' },
    });
  }

  /** Los roles son fijos (viven cableados en el código); solo se asignan. */
  listarRoles() {
    return this.prisma.role.findMany({ orderBy: { name: 'asc' } });
  }

  async crear(dto: CrearUsuarioDto) {
    const existe = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (existe)
      throw new ConflictException(`Ya existe un usuario "${dto.username}"`);

    const rol = await this.prisma.role.findUnique({ where: { id: dto.roleId } });
    if (!rol) throw new NotFoundException(`No existe el rol ${dto.roleId}`);

    return this.prisma.user.create({
      data: {
        username: dto.username,
        passwordHash: await this.hashing.hash(dto.password),
        roleId: dto.roleId,
      },
      select: SELECT_USUARIO,
    });
  }

  async actualizar(id: number, dto: ActualizarUsuarioDto, actorId?: number) {
    const usuario = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!usuario) throw new NotFoundException(`No existe el usuario ${id}`);

    // Un admin que se desactiva a sí mismo se deja por fuera en el acto, con la
    // sesión todavía abierta y sin manera de volver a entrar.
    if (actorId === id && dto.isActive === false)
      throw new BadRequestException('No puedes desactivar tu propio usuario');
    if (actorId === id && dto.roleId != null && dto.roleId !== usuario.roleId)
      throw new BadRequestException('No puedes cambiarte tu propio rol');

    // Quedarse sin ningún ADMIN activo deja el sistema sin quién lo administre,
    // y el ABM es justamente lo único que podría revertirlo. Se bloquea.
    const perderiaElAdmin =
      usuario.role.name === ROL_ADMIN &&
      usuario.isActive &&
      (dto.isActive === false ||
        (dto.roleId != null && dto.roleId !== usuario.roleId));
    if (perderiaElAdmin) await this.exigirOtroAdminActivo(id);

    const actualizado = await this.prisma.user.update({
      where: { id },
      data: { roleId: dto.roleId, isActive: dto.isActive },
      select: SELECT_USUARIO,
    });

    // Desactivar sin cortar la sesión viva no sirve de nada: quien se va
    // seguiría entrando con su refresh token hasta que expire.
    if (dto.isActive === false) await this.revocarSesiones(id);
    return actualizado;
  }

  async resetearPassword(id: number, dto: ResetearPasswordDto) {
    const usuario = await this.prisma.user.findUnique({ where: { id } });
    if (!usuario) throw new NotFoundException(`No existe el usuario ${id}`);

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await this.hashing.hash(dto.password) },
    });
    // Si la contraseña se resetea porque se filtró, las sesiones abiertas con
    // la vieja tienen que morir con ella.
    await this.revocarSesiones(id);
    return { ok: true };
  }

  /** El usuario NO se borra: firma despachos, incidencias y movimientos. */
  private async exigirOtroAdminActivo(excluyendoId: number) {
    const otros = await this.prisma.user.count({
      where: {
        id: { not: excluyendoId },
        isActive: true,
        role: { name: ROL_ADMIN },
      },
    });
    if (otros === 0)
      throw new BadRequestException(
        'Es el último ADMIN activo: deja el sistema sin quién lo administre',
      );
  }

  private revocarSesiones(userId: number) {
    return this.prisma.refreshToken.deleteMany({ where: { userId } });
  }
}
