import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { FabricacionModule } from '../fabricacion/fabricacion.module';

@Module({
  imports: [FabricacionModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
