import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { DespachoService } from './despacho.service';
import { DespacharDto } from './dto/despachar.dto';

@UseGuards(JwtAuthGuard)
@Controller('despachos')
export class DespachoController {
  constructor(private readonly service: DespachoService) {}

  @Post()
  crear(@Body() dto: DespacharDto, @Req() req: any) {
    return this.service.despachar(dto, req.user);
  }

  @Get()
  listar() {
    return this.service.listar();
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.service.obtener(id);
  }
}
