/**
 * Lectura de códigos (QR / Code128) con la cámara del dispositivo: el celular hace de
 * lector en la pantalla del operario. html5-qrcode se importa dinámicamente, solo se
 * descarga al abrir la cámara (patrón de las etiquetas y la proforma).
 * Requiere contexto seguro (HTTPS o localhost) y permiso de cámara; si no, `abrir` rechaza.
 */

export interface LectorCamara {
  /** Deja de decodificar (congela el video) mientras se atiende el par leído. */
  pausar(): void;
  reanudar(): void;
  /** Apaga la cámara y limpia el contenedor. */
  cerrar(): Promise<void>;
}

export function hayCamara(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

export async function abrirLectorCamara(
  elementId: string,
  onLectura: (codigo: string) => void,
): Promise<LectorCamara> {
  const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
  const lector = new Html5Qrcode(elementId, {
    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.CODE_128],
    verbose: false,
  });
  await lector.start(
    { facingMode: 'environment' }, // cámara trasera
    { fps: 10, qrbox: { width: 220, height: 220 } },
    (texto) => onLectura(texto.trim()),
    () => { /* frame sin código: ruido normal, no es error */ },
  );
  traducirAvisoDePausa(elementId);
  // pause/resume lanzan si el estado no es el esperado (p. ej. doble pausa): no es un fallo.
  const seguro = (fn: () => void) => { try { fn(); } catch { /* estado ya alcanzado */ } };
  return {
    pausar: () => seguro(() => lector.pause(true)),
    reanudar: () => seguro(() => lector.resume()),
    cerrar: async () => {
      try { await lector.stop(); } catch { /* ya estaba detenida */ }
      lector.clear();
    },
  };
}

/**
 * La librería crea al arrancar un letrero "Scanner paused" (sin id, sin clase y sin API
 * para cambiarlo) que muestra mientras se atiende un par. Se le cambia el texto una vez.
 */
function traducirAvisoDePausa(elementId: string): void {
  document.getElementById(elementId)?.querySelectorAll<HTMLElement>(':scope > div').forEach((d) => {
    if (d.innerText === 'Scanner paused') d.innerText = 'Cámara en pausa · atendiendo el par';
  });
}
