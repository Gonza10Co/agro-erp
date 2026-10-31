import { normalizarCodigoPar } from '../../features/fabricacion/codigo-par';

/**
 * Distingue la pistola (lector HID) de una persona tecleando: la pistola escribe
 * el código entero en ráfaga, con milisegundos entre tecla y tecla, y cierra con
 * Enter. Una persona tarda bastante más entre teclas.
 */
export const MAX_MS_ENTRE_TECLAS = 80;
const CODIGO_PAR = /^OF\d+-\d{4,}$/;

export class DetectorPistola {
  private buffer = '';
  private ultima = 0;

  /**
   * Alimenta una tecla. Devuelve el código del par cuando la ráfaga termina en
   * Enter y parece un código; si no, null.
   */
  tecla(key: string, ms: number): string | null {
    if (ms - this.ultima > MAX_MS_ENTRE_TECLAS) this.buffer = '';
    this.ultima = ms;
    if (key === 'Enter') {
      const crudo = this.buffer;
      this.buffer = '';
      if (crudo.length < 6) return null;
      const cod = normalizarCodigoPar(crudo);
      return CODIGO_PAR.test(cod) ? cod : null;
    }
    if (key.length === 1) this.buffer += key;
    else if (key !== 'Shift') this.buffer = '';
    return null;
  }
}
