import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { ClientesModule } from './clientes/clientes.module';
import { InventarioModule } from './inventario/inventario.module';
import { OcModule } from './pedidos/oc/oc.module';
import { OpModule } from './pedidos/op/op.module';
import { DespachoModule } from './despachos/despacho.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    CatalogModule,
    ClientesModule,
    InventarioModule,
    OcModule,
    OpModule,
    DespachoModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
