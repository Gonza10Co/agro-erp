import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OcService } from './oc.service';
import { OcCosteoService } from './oc-costeo.service';
import { CrearOCDto } from './dto/crear-oc.dto';
import { ActualizarOCDto } from './dto/actualizar-oc.dto';

@UseGuards(JwtAuthGuard)
@Controller('pedidos/oc')
export class OcController {
  constructor(
    private readonly oc: OcService,
    private readonly costeo: OcCosteoService,
  ) {}

  @Post() crear(@Body() dto: CrearOCDto) {
    return this.oc.crear(dto);
  }
  @Get() listar() {
    return this.oc.listar();
  }
  @Get(':id') obtener(@Param('id', ParseIntPipe) id: number) {
    return this.oc.obtener(id);
  }
  @Get(':id/costeo') costear(@Param('id', ParseIntPipe) id: number) {
    return this.costeo.costear(id);
  }
  @Patch(':id') actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarOCDto,
  ) {
    return this.oc.actualizar(id, dto);
  }
  @Post(':id/confirmar') confirmar(@Param('id', ParseIntPipe) id: number) {
    return this.oc.confirmar(id);
  }
  @Delete(':id') eliminar(@Param('id', ParseIntPipe) id: number) {
    return this.oc.eliminar(id);
  }
}
