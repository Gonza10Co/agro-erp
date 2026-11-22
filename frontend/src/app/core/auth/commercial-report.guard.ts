import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';
import { canSeeCommercialReport, rutaInicial } from './modulos';

/**
 * El reporte comercial es de gerencia y comercial: un operario o la tablet que teclee
 * la URL vuelve a su pantalla. El backend responde 403 igual.
 */
export const commercialReportGuard: CanActivateFn = () => {
  const rol = inject(AuthService).rol();
  return canSeeCommercialReport(rol) || inject(Router).parseUrl(rutaInicial(rol));
};
