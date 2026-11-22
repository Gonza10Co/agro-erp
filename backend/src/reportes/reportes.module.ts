import { Module } from '@nestjs/common';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';
import { CommercialReportController } from './commercial-report.controller';
import { CommercialReportService } from './commercial-report.service';

@Module({
  controllers: [ReportesController, CommercialReportController],
  providers: [ReportesService, CommercialReportService],
})
export class ReportesModule {}
