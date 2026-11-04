/** Lo que el dispositivo recuerda entre turnos (se configura una vez). */
export interface ConfigEstacion {
  estacion: string;
  operarioId: number;
  maquinaId?: number;
}
export const CLAVE_CONFIG = 'agro.estacion';

export function leerConfig(): ConfigEstacion | null {
  try {
    const raw = localStorage.getItem(CLAVE_CONFIG);
    if (!raw) return null;
    const c = JSON.parse(raw);
    return c && typeof c.estacion === 'string' && typeof c.operarioId === 'number' ? c : null;
  } catch {
    return null;
  }
}
export function guardarConfig(c: ConfigEstacion | null): void {
  try {
    if (c) localStorage.setItem(CLAVE_CONFIG, JSON.stringify(c));
    else localStorage.removeItem(CLAVE_CONFIG);
  } catch { /* sin storage (modo privado): la config vive solo en memoria */ }
}
