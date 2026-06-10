import { Celula } from './fabricacion.models';

export type ClaseDano = 'BAJA' | 'REPROCESO';

export interface TipoDano {
  id: number;
  codigo: string;
  nombre: string;
  celulaCausante: Celula;
  clase: ClaseDano;
}

export interface IncidenciaPar {
  id: number;
  timestamp: string;
  celulaDeteccion: Celula;
  descripcion: string | null;
  tipoDano: TipoDano;
  operario: { nombre: string };
  autorizadoPor: { username: string } | null;
  parReposicion: { codigo: string } | null;
}

export interface ReporteResultado {
  incidencia: { id: number; tipoDano: TipoDano };
  parReposicion: { codigo: string } | null;
}

export interface CentroIndicador {
  celula: Celula;
  total: number;
  bajas: number;
  reprocesos: number;
  paresProcesados: number;
  pctDano: number | null;
}

export interface TopDano {
  codigo: string;
  nombre: string;
  celulaCausante: Celula;
  clase: ClaseDano;
  total: number;
}

export interface IndicadoresCalidad {
  centros: CentroIndicador[];
  topDanos: TopDano[];
}
