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
import { ComprasModule } from './compras/compras.module';
import { FabricacionModule } from './fabricacion/fabricacion.module';
import { CalidadModule } from './calidad/calidad.module';
import { IndicadoresModule } from './indicadores/indicadores.module';
import { FacturasModule } from './facturas/factura.module';
import { CarteraModule } from './cartera/cartera.module';
import { DashboardModule } from './dashboard/dashboard.module';

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
    ComprasModule,
    FabricacionModule,
    CalidadModule,
    IndicadoresModule,
    FacturasModule,
    CarteraModule,
    DashboardModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
