import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // La plantilla de conteo de producto terminado viaja como JSON y pasa de sobra
  // los 100 kB por defecto de Express (miles de filas producto × talla).
  app.useBodyParser('json', { limit: '5mb' });
  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:4200')
    .split(',')
    .map((o) => o.trim());
  // Date expuesto: la tablet mide el desfase de su reloj para la hora de los pistolazos sin señal.
  app.enableCors({ origin: corsOrigins, credentials: true, exposedHeaders: ['Date'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
