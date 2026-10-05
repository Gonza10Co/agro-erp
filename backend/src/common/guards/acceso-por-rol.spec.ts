import { Controller, Get, INestApplication, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as request from 'supertest';
import { JwtStrategy } from '../../auth/jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { esRolAcotado, rolPuedeLlamar } from './acceso-por-rol';

describe('rolPuedeLlamar (lista blanca de roles acotados)', () => {
  it('los roles sin lista blanca pasan siempre (no rompe a nadie)', () => {
    for (const rol of ['ADMIN', 'GERENTE', 'CLIENTE', 'STAGE', 'OPERARIO', 'CALIDAD', null, undefined]) {
      expect(esRolAcotado(rol)).toBe(false);
      expect(rolPuedeLlamar(rol, 'GET', '/facturas')).toBe(true);
      expect(rolPuedeLlamar(rol, 'POST', '/clientes')).toBe(true);
    }
  });

  describe('JEFE_CORTE', () => {
    it('es un rol acotado', () => {
      expect(esRolAcotado('JEFE_CORTE')).toBe(true);
    });

    it('puede todo lo de corte y su sesión', () => {
      expect(rolPuedeLlamar('JEFE_CORTE', 'GET', '/auth/me')).toBe(true);
      expect(rolPuedeLlamar('JEFE_CORTE', 'GET', '/corte/tablero')).toBe(true);
      expect(rolPuedeLlamar('JEFE_CORTE', 'GET', '/corte/ordenes')).toBe(true);
      expect(rolPuedeLlamar('JEFE_CORTE', 'GET', '/corte/ordenes/:id')).toBe(true);
      expect(rolPuedeLlamar('JEFE_CORTE', 'POST', '/corte/ordenes')).toBe(true);
      expect(rolPuedeLlamar('JEFE_CORTE', 'PATCH', '/corte/ordenes/:id/estado')).toBe(true);
      expect(rolPuedeLlamar('JEFE_CORTE', 'POST', '/corte/ordenes/:id/avances')).toBe(true);
    });

    it('lee el listado de líneas (filtro del tablero), pero no lo escribe', () => {
      expect(rolPuedeLlamar('JEFE_CORTE', 'GET', '/catalog/lineas')).toBe(true);
      expect(rolPuedeLlamar('JEFE_CORTE', 'GET', '/catalog/lineas?incluirInactivas=true')).toBe(true);
      expect(rolPuedeLlamar('JEFE_CORTE', 'POST', '/catalog/lineas')).toBe(false);
      expect(rolPuedeLlamar('JEFE_CORTE', 'PATCH', '/catalog/lineas/:id/desactivar')).toBe(false);
    });

    it('niega todo lo demás (deny by default)', () => {
      for (const ruta of [
        '/clientes', '/facturas', '/cartera', '/compras/ordenes', '/catalog/materiales',
        '/catalog/productos', '/pedidos/oc', '/pedidos/op', '/fabricacion/of', '/inventario',
        '/dashboard', '/reportes/diario', '/usuarios', '/operarios', '/proveedores', '/',
      ]) {
        expect(rolPuedeLlamar('JEFE_CORTE', 'GET', ruta)).toBe(false);
      }
    });

    it('no se deja engañar por prefijos parecidos, mayúsculas ni `..`', () => {
      expect(rolPuedeLlamar('JEFE_CORTE', 'GET', '/cortes')).toBe(false);
      expect(rolPuedeLlamar('JEFE_CORTE', 'GET', '/authx')).toBe(false);
      expect(rolPuedeLlamar('JEFE_CORTE', 'GET', '/CORTE/tablero')).toBe(true);
      expect(rolPuedeLlamar('JEFE_CORTE', 'GET', '/corte/../facturas')).toBe(false);
      expect(rolPuedeLlamar('JEFE_CORTE', 'GET', '/catalog/lineas/../materiales')).toBe(false);
    });
  });
});

// Montaje real (Express + passport-jwt + el guard), sin base de datos: comprueba
// que el filtro mira la ruta que Nest de verdad despacha y responde 403.
@UseGuards(JwtAuthGuard)
@Controller('corte')
class CorteFalsoController {
  @Get('ordenes/:id') obtener(@Param('id') id: string) { return { id }; }
  @Post('ordenes/:id/avances') avance() { return { ok: true }; }
}

@UseGuards(JwtAuthGuard)
@Controller('catalog/lineas')
class LineasFalsoController {
  @Get() listar() { return []; }
  @Patch(':id/desactivar') desactivar() { return { ok: true }; }
}

@UseGuards(JwtAuthGuard)
@Controller('facturas')
class FacturasFalsoController {
  @Get() listar() { return []; }
}

describe('JwtAuthGuard + lista blanca (montaje HTTP)', () => {
  const SECRETO = 'secreto-de-prueba';
  let app: INestApplication;
  let jwt: JwtService;

  const token = (role: string) => jwt.sign({ sub: 1, username: 'u', role }, { secret: SECRETO });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      controllers: [CorteFalsoController, LineasFalsoController, FacturasFalsoController],
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: { getOrThrow: () => SECRETO } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('JEFE_CORTE entra a corte y al listado de líneas', async () => {
    const t = token('JEFE_CORTE');
    await request(app.getHttpServer()).get('/corte/ordenes/7').set('Authorization', `Bearer ${t}`).expect(200);
    await request(app.getHttpServer()).post('/corte/ordenes/7/avances').set('Authorization', `Bearer ${t}`).expect(201);
    await request(app.getHttpServer()).get('/catalog/lineas').set('Authorization', `Bearer ${t}`).expect(200);
  });

  it('JEFE_CORTE recibe 403 fuera de su lista', async () => {
    const t = token('JEFE_CORTE');
    await request(app.getHttpServer()).get('/facturas').set('Authorization', `Bearer ${t}`).expect(403);
    await request(app.getHttpServer()).patch('/catalog/lineas/1/desactivar').set('Authorization', `Bearer ${t}`).expect(403);
  });

  it('los demás roles siguen igual', async () => {
    for (const rol of ['ADMIN', 'CLIENTE', 'OPERARIO']) {
      await request(app.getHttpServer()).get('/facturas').set('Authorization', `Bearer ${token(rol)}`).expect(200);
    }
  });

  it('sin token sigue siendo 401, no 403', async () => {
    await request(app.getHttpServer()).get('/corte/ordenes/7').expect(401);
  });
});
