import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { ClientesModule } from './clientes/clientes.module';
import { ProveedoresModule } from './proveedores/proveedores.module';
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
import { ReportesModule } from './reportes/reportes.module';
// Administración: accesos al sistema (User) y gente de planta (Operario). Son
// entidades distintas — el operario no tiene login, solo firma escaneos.
import { UsersModule } from './users/users.module';
import { OperariosModule } from './operarios/operarios.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    CatalogModule,
    ClientesModule,
    ProveedoresModule,
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
    ReportesModule,
    UsersModule,
    OperariosModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
