import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UsersService } from './users.service';
import { JwtPayload } from '../auth/jwt.strategy';
import { CrearUsuarioDto } from './dto/crear-usuario.dto';
import { ActualizarUsuarioDto } from './dto/actualizar-usuario.dto';
import { ResetearPasswordDto } from './dto/resetear-password.dto';

/**
 * ABM de usuarios. TODO el controlador es solo-ADMIN, incluidas las lecturas:
 * el listado ya revela quién tiene acceso y con qué rol.
 *
 * No hay DELETE a propósito — el usuario firma despachos, incidencias y
 * movimientos de inventario; borrarlo rompería la trazabilidad. Se desactiva.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('usuarios')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get() listar() {
    return this.users.listar();
  }

  @Get('roles') roles() {
    return this.users.listarRoles();
  }

  @Post() crear(@Body() dto: CrearUsuarioDto) {
    return this.users.crear(dto);
  }

  @Patch(':id') actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarUsuarioDto,
    @Req() req: { user?: JwtPayload },
  ) {
    // El actor va por el token, nunca por el body: si lo mandara el cliente,
    // bastaría con mentir para saltarse los guardarraíles de auto-bloqueo.
    return this.users.actualizar(id, dto, req.user?.sub);
  }

  @Patch(':id/password') resetearPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetearPasswordDto,
  ) {
    return this.users.resetearPassword(id, dto);
  }
}
