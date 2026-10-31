/**
 * Sonidos del resultado del pistolazo. El pito de la pistola solo dice que LEYÓ;
 * estos dicen si el sistema REGISTRÓ: agudo y corto = registrado, dos medios =
 * repetido, grave y largo = no quedó. Sin audio disponible no hace nada.
 */
export type SonidoPistola = 'ok' | 'alerta' | 'error';

let ctx: AudioContext | null = null;

function tono(ac: AudioContext, hz: number, desde: number, dura: number, tipo: OscillatorType = 'sine'): void {
  const osc = ac.createOscillator();
  const gan = ac.createGain();
  osc.type = tipo;
  osc.frequency.value = hz;
  gan.gain.setValueAtTime(0.25, ac.currentTime + desde);
  gan.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + desde + dura);
  osc.connect(gan).connect(ac.destination);
  osc.start(ac.currentTime + desde);
  osc.stop(ac.currentTime + desde + dura);
}

export function sonar(s: SonidoPistola): void {
  try {
    const AC = (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    if (s === 'ok') tono(ctx, 1320, 0, 0.12);
    else if (s === 'alerta') { tono(ctx, 660, 0, 0.12); tono(ctx, 660, 0.18, 0.12); }
    else tono(ctx, 180, 0, 0.6, 'square');
  } catch { /* sin audio: queda el aviso en pantalla */ }
}
