import { Controller, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OpService } from './op.service';

@UseGuards(JwtAuthGuard)
@Controller('pedidos/op')
export class OpController {
  constructor(private readonly op: OpService) {}

  @Post('desde-oc/:ocId') generar(@Param('ocId', ParseIntPipe) ocId: number) {
    return this.op.generarDesdeOC(ocId);
  }
  @Post(':id/anular') anular(@Param('id', ParseIntPipe) id: number) {
    return this.op.anular(id);
  }
}
