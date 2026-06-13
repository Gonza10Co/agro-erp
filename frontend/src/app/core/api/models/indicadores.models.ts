import { Celula, SubPasoGuarnicion } from './fabricacion.models';

export interface EtapaIndicador {
  celula: Celula;
  subPaso: SubPasoGuarnicion | null;
  tramos: number;
  promedioMin: number;
}

export interface RecursoIndicador {
  operarioId?: number;
  maquinaId?: number;
  nombre: string;
  tramos: number;
  promedioMin: number;
}

export interface AlertaDemora {
  codigo: string;
  celula: Celula;
  subPaso: SubPasoGuarnicion | null;
  minutosEnEtapa: number;
  umbralMin: number;
}

export interface Indicadores {
  etapas: EtapaIndicador[];
  operarios: RecursoIndicador[];
  maquinas: RecursoIndicador[];
  alertas: AlertaDemora[];
}
