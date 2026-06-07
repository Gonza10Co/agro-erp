import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { FabricacionService } from './fabricacion.service';
import { AvanzarDto } from './dto/avanzar.dto';

@UseGuards(JwtAuthGuard)
@Controller('fabricacion')
export class FabricacionController {
  constructor(private readonly service: FabricacionService) {}

  @Post('of')
  generarOF(@Body('opId', ParseIntPipe) opId: number) {
    return this.service.generarOF(opId);
  }

  @Get('of')
  listarOF() {
    return this.service.listarOF();
  }

  @Get('of/:id')
  obtenerOF(@Param('id', ParseIntPipe) id: number) {
    return this.service.obtenerOF(id);
  }

  @Post('par/:codigo/avanzar')
  avanzar(@Param('codigo') codigo: string, @Body() dto: AvanzarDto) {
    return this.service.avanzar(codigo, dto);
  }

  @Get('par/:codigo')
  obtenerPar(@Param('codigo') codigo: string) {
    return this.service.obtenerPar(codigo);
  }

  @Get('tablero')
  tablero(@Query('ofId') ofId?: string) {
    return this.service.tablero(ofId ? Number(ofId) : undefined);
  }

  @Get('operarios')
  operarios(@Query('celula') celula?: string) {
    return this.service.listarOperarios(celula);
  }

  @Get('maquinas')
  maquinas(@Query('celula') celula?: string) {
    return this.service.listarMaquinas(celula);
  }
}
