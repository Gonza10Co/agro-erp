import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Celula, EstadoPar } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { FabricacionService } from './fabricacion.service';
import { AvanzarDto } from './dto/avanzar.dto';
import { NacerDto } from './dto/nacer.dto';
import { ActivarEstacionDto } from './dto/activar-estacion.dto';
import { RegistrarConsumoDto } from './dto/registrar-consumo.dto';

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

  /** Teórico (BOM × pares) vs entregado por el almacenista. */
  @Get('of/:id/consumo')
  consumoDeOf(@Param('id', ParseIntPipe) id: number) {
    return this.service.consumoDeOf(id);
  }

  /** Registro manual de la entrega de materiales a la OF (acumulativo). */
  @Post('of/:id/consumo')
  registrarConsumo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegistrarConsumoDto,
    @Req() req: any,
  ) {
    return this.service.registrarConsumo(id, dto, req.user);
  }

  /** Nacen pares de la OF en su estación inicial (se imprime la etiqueta de la lengua). */
  @Post('of/:id/nacer')
  nacer(@Param('id', ParseIntPipe) id: number, @Body() dto: NacerDto) {
    return this.service.nacer(id, dto);
  }

  @Post('par/:codigo/avanzar')
  avanzar(@Param('codigo') codigo: string, @Body() dto: AvanzarDto) {
    return this.service.avanzar(codigo, dto);
  }

  /** Puntos de control del recorrido (activos e inactivos). */
  @Get('estaciones')
  estaciones() {
    return this.service.estaciones();
  }

  /** Prender/apagar una estación: cambia el recorrido sin desplegar. */
  @Patch('estaciones/:codigo')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  activarEstacion(@Param('codigo') codigo: string, @Body() dto: ActivarEstacionDto) {
    return this.service.activarEstacion(codigo, dto.activa);
  }

  /** TV de planta: entradas de hoy por estación contra la meta del día. */
  @Get('hoy')
  hoy() {
    return this.service.hoy();
  }

  /** Tablero por órdenes: cuántos pares de cada OF ya pasaron por cada estación. */
  @Get('tablero-ordenes')
  tableroOrdenes() {
    return this.service.tableroOrdenes();
  }

  @Get('par/:codigo')
  obtenerPar(@Param('codigo') codigo: string) {
    return this.service.obtenerPar(codigo);
  }

  /** El tablero en números: la planta mueve ~1.206 pares al día, no caben en una lista. */
  @Get('tablero-resumen')
  tableroResumen(@Query('ofId', new ParseIntPipe({ optional: true })) ofId?: number) {
    return this.service.tableroResumen(ofId);
  }

  /** El detalle de una columna del tablero, paginado (se pide al abrir la célula). */
  @Get('tablero')
  tablero(
    @Query('ofId', new ParseIntPipe({ optional: true })) ofId?: number,
    @Query('celula', new ParseEnumPipe(Celula, { optional: true })) celula?: Celula,
    @Query('estados') estados?: string,
    @Query('take', new ParseIntPipe({ optional: true })) take?: number,
    @Query('skip', new ParseIntPipe({ optional: true })) skip?: number,
  ) {
    return this.service.tablero(ofId, { celula, estados: parsearEstados(estados), take, skip });
  }

  @Get('operarios')
  operarios(@Query('celula', new ParseEnumPipe(Celula, { optional: true })) celula?: Celula) {
    return this.service.listarOperarios(celula);
  }

  @Get('maquinas')
  maquinas(@Query('celula', new ParseEnumPipe(Celula, { optional: true })) celula?: Celula) {
    return this.service.listarMaquinas(celula);
  }
}

/** `?estados=TERMINADO,CANCELADO` → enum validado; lo desconocido se ignora. */
function parsearEstados(crudo?: string): EstadoPar[] | undefined {
  if (!crudo) return undefined;
  const validos = crudo
    .split(',')
    .map((e) => e.trim().toUpperCase())
    .filter((e): e is EstadoPar => e in EstadoPar);
  return validos.length ? validos : undefined;
}
