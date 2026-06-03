import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OcService } from './oc.service';
import { CrearOCDto } from './dto/crear-oc.dto';

@UseGuards(JwtAuthGuard)
@Controller('pedidos/oc')
export class OcController {
  constructor(private readonly oc: OcService) {}

  @Post() crear(@Body() dto: CrearOCDto) {
    return this.oc.crear(dto);
  }
  @Post(':id/confirmar') confirmar(@Param('id', ParseIntPipe) id: number) {
    return this.oc.confirmar(id);
  }
}
