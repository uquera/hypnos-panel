// Conversión única de monedas a USD para todos los módulos del panel.
// Tasas fijas de referencia: 1 USD = 1000 CLP · 1 EUR = 1.1 USD
export function toUSD(monto: number, moneda: string): number {
  if (moneda === "USD") return monto
  if (moneda === "CLP") return monto / 1000
  if (moneda === "EUR") return monto * 1.1
  return monto
}
