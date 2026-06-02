import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { UsersModule } from '../users/users.module';
import { HashingService } from '../common/hashing.service';

@Module({
  imports: [ConfigModule, UsersModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, HashingService, JwtStrategy],
})
export class AuthModule {}
