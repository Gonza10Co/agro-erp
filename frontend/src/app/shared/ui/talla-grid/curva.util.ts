export function totalCurva(valores: Record<number, number>): number {
  return Object.values(valores).reduce((a, b) => a + (b || 0), 0);
}
