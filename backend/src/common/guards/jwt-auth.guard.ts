import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { rolPuedeLlamar } from './acceso-por-rol';

/**
 * Autentica el JWT y, de una vez, aplica la lista blanca de los roles acotados
 * (p. ej. JEFE_CORTE): si el rol tiene lista y el endpoint no está en ella, 403.
 * Va acá y no en un guard aparte porque todos los controladores protegidos ya
 * pasan por este guard; un endpoint nuevo queda cerrado para el rol acotado solo.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = any>(
    err: any,
    user: any,
    info: any,
    context: ExecutionContext,
    status?: any,
  ): TUser {
    const autenticado = super.handleRequest<TUser>(err, user, info, context, status);
    const req = context.switchToHttp().getRequest();
    // El patrón de la ruta que Nest va a ejecutar (`/corte/ordenes/:id`) manda
    // sobre la URL cruda: es exactamente el handler que se invoca.
    const ruta: string = req?.route?.path ?? req?.path ?? req?.url ?? '';
    const rol: string | undefined = (autenticado as any)?.role;
    if (!rolPuedeLlamar(rol, req?.method ?? 'GET', ruta)) {
      throw new ForbiddenException('Tu rol no tiene acceso a esta parte del sistema');
    }
    return autenticado;
  }
}
