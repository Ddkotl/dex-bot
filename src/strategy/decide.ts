// src/strategy/decide.ts
import type { DexCoinConfig } from "../config";

export type Action =
  | { type: "OPEN_BUY"; price: number; quoteAmount: number }
  | { type: "OPEN_SELL"; price: number; tokens: number }
  | { type: "NOOP"; reason: string };

interface DecideInput {
  config: DexCoinConfig;
  market: {
    // то, что вернул analyzeMarket
    currentPrice: number;
    localMinPrice: number;
    localMaxPrice: number;
    localRange: number;
    rangePct: number;
    driftPct: number;
    isSideways: boolean;
  };
  quoteBalance: number;
  tokenBalance: number;
  positions: unknown[]; // результат getActiveLimitPositions
}

export function decide(i: DecideInput): Action {
  const { config: c, market: m, quoteBalance, tokenBalance, positions } = i;

  // ── Фильтры рынка ───────────────────────────────
  if (!m.isSideways) return { type: "NOOP", reason: "not sideways" };
  if (m.rangePct > c.MAX_RANGE_PCT)
    return { type: "NOOP", reason: `range ${m.rangePct.toFixed(1)}% > MAX` };
  if (m.rangePct < c.MIN_RANGE_PCT)
    return { type: "NOOP", reason: `range ${m.rangePct.toFixed(1)}% < MIN` };
  if (Math.abs(m.driftPct) > c.STOP_LOSS_PCT)
    return { type: "NOOP", reason: `drift ${m.driftPct.toFixed(1)}% > SL` };

  // ── Уже что-то висит — ждём фила ────────────────
  if (positions.length > 0)
    return { type: "NOOP", reason: "order pending, waiting fill" };

  // ── Целевые цены (BUY_RANGE/SELL_RANGE = доля от localRange) ──
  const buyPrice = m.localMinPrice + c.BUY_RANGE * m.localRange;
  const sellPrice = m.localMinPrice + c.SELL_RANGE * m.localRange;

  // ── Защита от немедленного фила (цена уже прошла) ──
  const buySafe = buyPrice < m.currentPrice * (1 - c.MIN_RANGE_PCT / 100);
  const sellSafe = sellPrice > m.currentPrice * (1 + c.MIN_RANGE_PCT / 100);

  // ── Stateless-выбор стороны: что у нас на балансе? ──
  const tokenValueUsdc = tokenBalance * m.currentPrice;

  if (tokenValueUsdc >= c.MIN_NOTIONAL) {
    if (!sellSafe)
      return {
        type: "NOOP",
        reason: `sell ${sellPrice.toFixed(8)} not above current ${m.currentPrice.toFixed(8)}`,
      };
    return { type: "OPEN_SELL", price: sellPrice, tokens: tokenBalance };
  }

  if (quoteBalance >= c.MIN_NOTIONAL) {
    if (!buySafe)
      return {
        type: "NOOP",
        reason: `buy ${buyPrice.toFixed(8)} not below current ${m.currentPrice.toFixed(8)}`,
      };
    const spend = Math.min(c.QUOTE_QUANTITY, quoteBalance);
    return { type: "OPEN_BUY", price: buyPrice, quoteAmount: spend };
  }

  return { type: "NOOP", reason: "both balances below MIN_NOTIONAL" };
}
