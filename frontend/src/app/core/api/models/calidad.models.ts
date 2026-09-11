import { Celula } from './fabricacion.models';

/** BAJA: acta + reposición · REPROCESO: solo registro · SEGUNDA: el par sigue, baja de grado. */
export type ClaseDano = 'BAJA' | 'REPROCESO' | 'SEGUNDA';

/** Qué le pasa al par según la clase del daño (texto para el operario). */
export const DESTINO_CLASE: Record<ClaseDano, string> = {
  SEGUNDA: 'Sigue, pero como SEGUNDA',
  REPROCESO: 'Se repara y sigue',
  BAJA: 'Se da de baja y se repone',
};

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
  parReposicion: { codigo: string; celulaActual: Celula } | null;
}

export interface CentroIndicador {
  celula: Celula;
  total: number;
  bajas: number;
  reprocesos: number;
  segundas: number;
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
