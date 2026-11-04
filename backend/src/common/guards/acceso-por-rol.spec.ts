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
      // El formulario "Nueva orden de corte" lista las OF sin abrir fabricación.
      expect(rolPuedeLlamar('JEFE_CORTE', 'GET', '/corte/ofs-disponibles')).toBe(true);
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

describe('ESTACION (la tablet de la estación)', () => {
  it('es un rol acotado', () => {
    expect(esRolAcotado('ESTACION')).toBe(true);
  });

  it('pistolea, nace pares y lee lo que la estación, el tablero y la TV necesitan', () => {
    expect(rolPuedeLlamar('ESTACION', 'GET', '/auth/me')).toBe(true);
    expect(rolPuedeLlamar('ESTACION', 'POST', '/auth/refresh')).toBe(true);
    expect(rolPuedeLlamar('ESTACION', 'POST', '/fabricacion/par/:codigo/avanzar')).toBe(true);
    expect(rolPuedeLlamar('ESTACION', 'POST', '/fabricacion/par/OF19-0001/avanzar')).toBe(true);
    expect(rolPuedeLlamar('ESTACION', 'GET', '/fabricacion/par/:codigo')).toBe(true);
    expect(rolPuedeLlamar('ESTACION', 'GET', '/fabricacion/estaciones')).toBe(true);
    expect(rolPuedeLlamar('ESTACION', 'GET', '/fabricacion/operarios')).toBe(true);
    expect(rolPuedeLlamar('ESTACION', 'GET', '/fabricacion/maquinas?celula=INYECCION')).toBe(true);
    expect(rolPuedeLlamar('ESTACION', 'GET', '/fabricacion/hoy')).toBe(true);
    expect(rolPuedeLlamar('ESTACION', 'GET', '/fabricacion/tablero')).toBe(true);
    expect(rolPuedeLlamar('ESTACION', 'GET', '/fabricacion/tablero-resumen')).toBe(true);
    expect(rolPuedeLlamar('ESTACION', 'GET', '/fabricacion/tablero-ordenes')).toBe(true);
    // Preparación: elige la OF, nace la tanda e imprime etiquetas.
    expect(rolPuedeLlamar('ESTACION', 'GET', '/fabricacion/of')).toBe(true);
    expect(rolPuedeLlamar('ESTACION', 'GET', '/fabricacion/of/:id')).toBe(true);
    expect(rolPuedeLlamar('ESTACION', 'POST', '/fabricacion/of/:id/nacer')).toBe(true);
    expect(rolPuedeLlamar('ESTACION', 'POST', '/fabricacion/of/:id/reservar-etiquetas')).toBe(true);
    expect(rolPuedeLlamar('ESTACION', 'GET', '/fabricacion/of/:id/etiquetas-reservadas')).toBe(true);
    // "Algo pasó con este par": el catálogo de daños.
    expect(rolPuedeLlamar('ESTACION', 'GET', '/calidad/tipos-dano')).toBe(true);
  });

  it('no crea OF, no prende ni apaga estaciones, no registra consumo ni inspecciona en PT', () => {
    expect(rolPuedeLlamar('ESTACION', 'POST', '/fabricacion/of')).toBe(false);
    expect(rolPuedeLlamar('ESTACION', 'POST', '/fabricacion/pares/mover-lote')).toBe(false);
    expect(rolPuedeLlamar('ESTACION', 'POST', '/fabricacion/pares/cerrar-lote')).toBe(false);
    expect(rolPuedeLlamar('ESTACION', 'PATCH', '/fabricacion/estaciones/:codigo')).toBe(false);
    expect(rolPuedeLlamar('ESTACION', 'GET', '/fabricacion/of/:id/consumo')).toBe(false);
    expect(rolPuedeLlamar('ESTACION', 'POST', '/fabricacion/of/:id/consumo')).toBe(false);
    expect(rolPuedeLlamar('ESTACION', 'POST', '/calidad/pares/:codigo/incidencias')).toBe(false);
    expect(rolPuedeLlamar('ESTACION', 'GET', '/calidad/indicadores')).toBe(false);
  });

  it('niega todo lo demás (deny by default)', () => {
    for (const ruta of [
      '/clientes', '/facturas', '/cartera', '/compras/ordenes', '/catalog/materiales', '/catalog/lineas',
      '/catalog/productos', '/pedidos/oc', '/pedidos/op', '/inventario', '/corte/ordenes',
      '/dashboard', '/reportes/diario', '/usuarios', '/operarios', '/proveedores', '/',
    ]) {
      expect(rolPuedeLlamar('ESTACION', 'GET', ruta)).toBe(false);
    }
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

@UseGuards(JwtAuthGuard)
@Controller('fabricacion')
class FabricacionFalsoController {
  @Post('of') crearOf() { return { ok: true }; }
  @Post('par/:codigo/avanzar') avanzar(@Param('codigo') codigo: string) { return { codigo }; }
  @Get('hoy') hoy() { return {}; }
  @Patch('estaciones/:codigo') activar() { return { ok: true }; }
}

describe('JwtAuthGuard + lista blanca (montaje HTTP)', () => {
  const SECRETO = 'secreto-de-prueba';
  let app: INestApplication;
  let jwt: JwtService;

  const token = (role: string) => jwt.sign({ sub: 1, username: 'u', role }, { secret: SECRETO });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      controllers: [CorteFalsoController, LineasFalsoController, FacturasFalsoController, FabricacionFalsoController],
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

  it('ESTACION pistolea y lee la TV, pero no crea OF ni toca las estaciones', async () => {
    const t = token('ESTACION');
    await request(app.getHttpServer()).post('/fabricacion/par/OF19-0001/avanzar').set('Authorization', `Bearer ${t}`).expect(201);
    await request(app.getHttpServer()).get('/fabricacion/hoy').set('Authorization', `Bearer ${t}`).expect(200);
    await request(app.getHttpServer()).post('/fabricacion/of').set('Authorization', `Bearer ${t}`).expect(403);
    await request(app.getHttpServer()).patch('/fabricacion/estaciones/CIERRE').set('Authorization', `Bearer ${t}`).expect(403);
    await request(app.getHttpServer()).get('/facturas').set('Authorization', `Bearer ${t}`).expect(403);
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
