import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReassignPtDto, ReleasePtDto } from './dto/reassign-pt.dto';
import { PtReassignmentService, ROLES_REASIGNAN_PARES } from './pt-reassignment.service';

/**
 * Pasar o liberar pares reservados en PT de una OP. Escribir y ver las opciones es
 * solo de gerencia (el guard y además el service); el historial lo ve quien ve la OP.
 */
@UseGuards(JwtAuthGuard)
@Controller('pedidos/op')
export class PtReassignmentController {
  constructor(private readonly service: PtReassignmentService) {}

  @UseGuards(RolesGuard)
  @Roles(...ROLES_REASIGNAN_PARES)
  @Get(':id/reassignment-options')
  options(@Param('id', ParseIntPipe) id: number) {
    return this.service.options(id);
  }

  @Get(':id/reassignments')
  history(@Param('id', ParseIntPipe) id: number) {
    return this.service.history(id);
  }

  @UseGuards(RolesGuard)
  @Roles(...ROLES_REASIGNAN_PARES)
  @Post(':id/reassign')
  reassign(@Param('id', ParseIntPipe) id: number, @Body() dto: ReassignPtDto, @Req() req: any) {
    return this.service.reassign(id, dto, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles(...ROLES_REASIGNAN_PARES)
  @Post(':id/release')
  release(@Param('id', ParseIntPipe) id: number, @Body() dto: ReleasePtDto, @Req() req: any) {
    return this.service.release(id, dto, req.user);
  }
}
