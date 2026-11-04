import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as ms from 'ms';
import { UsersService } from '../users/users.service';
import { HashingService } from '../common/hashing.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

/**
 * Margen en que un refresh token recién rotado se sigue aceptando: dos pestañas
 * (o la tablet que reintenta tras un corte de wifi) pueden refrescar con el
 * mismo token casi a la vez, y la segunda no debe botar al operario al login.
 */
export const GRACIA_ROTACION_MS = 60_000;

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly hashing: HashingService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config?: ConfigService,
  ) {}

  async login(dto: LoginDto): Promise<Tokens> {
    const user = await this.users.findByUsername(dto.username);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const valid = await this.hashing.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    return this.issueTokens(user.id, user.username, user.role.name);
  }

  /**
   * Cambia un refresh token vigente por un par nuevo (rotación). La sesión se
   * desliza: mientras la tablet se use al menos una vez dentro de la vigencia
   * del refresh (7 días por defecto), nunca vuelve al login.
   */
  async refresh(refreshToken: string): Promise<Tokens> {
    const refreshSecret =
      this.config?.get<string>('JWT_REFRESH_SECRET') ??
      process.env.JWT_REFRESH_SECRET;
    let payload: { sub: number };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, { secret: refreshSecret });
    } catch {
      throw new UnauthorizedException('Sesión vencida');
    }
    const user = await this.users.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Sesión vencida');
    }
    const ahora = Date.now();
    const filas = await this.prisma.refreshToken.findMany({
      where: {
        userId: user.id,
        expiresAt: { gt: new Date(ahora) },
        OR: [
          { revokedAt: null },
          { revokedAt: { gt: new Date(ahora - GRACIA_ROTACION_MS) } },
        ],
      },
      orderBy: { id: 'desc' },
      take: 50,
    });
    let usada: { id: number; revokedAt: Date | null } | undefined;
    for (const f of filas) {
      if (await argon2.verify(f.tokenHash, refreshToken)) {
        usada = f;
        break;
      }
    }
    if (!usada) throw new UnauthorizedException('Sesión vencida');
    const recienRotada =
      usada.revokedAt && ahora - usada.revokedAt.getTime() <= GRACIA_ROTACION_MS;
    if (usada.revokedAt && !recienRotada) {
      throw new UnauthorizedException('Sesión vencida');
    }
    if (!usada.revokedAt) {
      await this.prisma.refreshToken.update({
        where: { id: usada.id },
        data: { revokedAt: new Date(ahora) },
      });
    }
    return this.issueTokens(user.id, user.username, user.role.name);
  }

  private async issueTokens(
    userId: number,
    username: string,
    role: string,
  ): Promise<Tokens> {
    const payload = { sub: userId, username, role };
    const accessSecret =
      this.config?.get<string>('JWT_ACCESS_SECRET') ??
      process.env.JWT_ACCESS_SECRET;
    const refreshSecret =
      this.config?.get<string>('JWT_REFRESH_SECRET') ??
      process.env.JWT_REFRESH_SECRET;

    const accessTtl = (process.env.JWT_ACCESS_TTL ?? '900s') as ms.StringValue;
    const refreshTtl = (process.env.JWT_REFRESH_TTL ?? '7d') as ms.StringValue;

    const accessToken = await this.jwt.signAsync(payload, {
      secret: accessSecret,
      expiresIn: accessTtl,
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: refreshSecret,
      expiresIn: refreshTtl,
    });

    const tokenHash = await argon2.hash(refreshToken);
    // La vigencia guardada sale del propio JWT (respeta JWT_REFRESH_TTL).
    const exp = (this.jwt.decode?.(refreshToken) as { exp?: number } | null)?.exp;
    const expiresAt = exp
      ? new Date(exp * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.prisma.refreshToken.create({
      data: { tokenHash, userId, expiresAt },
    });

    return { accessToken, refreshToken };
  }
}
