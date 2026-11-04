/**
 * Candado de pantalla (Screen Wake Lock API): mientras la estación está abierta
 * la tablet no se suspende, porque con la pantalla apagada Android congela
 * Chrome y los pistolazos se pierden. El navegador suelta el candado al
 * ocultar la pestaña; se vuelve a pedir al regresar. Necesita HTTPS (prod lo es).
 * Sin soporte (navegador viejo) no hace nada: queda el ajuste de Android
 * "Permanecer activo mientras carga".
 */
interface Candado { release(): Promise<void>; }
interface NavegadorConCandado { wakeLock?: { request(tipo: 'screen'): Promise<Candado> } }

export function mantenerPantallaEncendida(
  nav: NavegadorConCandado = navigator as NavegadorConCandado,
  doc: Document = document,
): () => void {
  if (!nav.wakeLock) return () => {};
  let candado: Candado | null = null;
  let activo = true;

  const pedir = async () => {
    if (!activo || doc.visibilityState !== 'visible') return;
    try {
      candado = await nav.wakeLock!.request('screen');
      if (!activo) void candado.release();
    } catch {
      candado = null; // batería baja o permiso negado: no se rompe la estación
    }
  };
  const alVolver = () => { if (doc.visibilityState === 'visible') void pedir(); };

  doc.addEventListener('visibilitychange', alVolver);
  void pedir();

  return () => {
    activo = false;
    doc.removeEventListener('visibilitychange', alVolver);
    void candado?.release();
    candado = null;
  };
}
