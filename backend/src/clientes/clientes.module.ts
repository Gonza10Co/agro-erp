import { Module } from '@nestjs/common';
import { ClientesController } from './clientes.controller';
import { ClientesService } from './clientes.service';
import { SedesController } from './sedes.controller';
import { SedesService } from './sedes.service';

@Module({
  controllers: [ClientesController, SedesController],
  providers: [ClientesService, SedesService],
  exports: [ClientesService, SedesService],
})
export class ClientesModule {}
