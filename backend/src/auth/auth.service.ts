import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as ms from 'ms';
import { UsersService } from '../users/users.service';
import { HashingService } from '../common/hashing.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

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

  private async issueTokens(userId: number, username: string, role: string): Promise<Tokens> {
    const payload = { sub: userId, username, role };
    const accessSecret = this.config?.get<string>('JWT_ACCESS_SECRET') ?? process.env.JWT_ACCESS_SECRET;
    const refreshSecret = this.config?.get<string>('JWT_REFRESH_SECRET') ?? process.env.JWT_REFRESH_SECRET;

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
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.prisma.refreshToken.create({
      data: { tokenHash, userId, expiresAt },
    });

    return { accessToken, refreshToken };
  }
}
