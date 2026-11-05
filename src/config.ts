export interface DexCoinConfig {
  SYMBOL: string;
  DECEMIALS: number;
  TOKEN_MINT: string;
  POOL_ADDRESS: string;

  /**
   * Объём одной buy-лимитки в единицах quote-токена.
   * Для SOL-пары — в SOL (например, 0.05 = ~$4.75).
   * Для USDC-пары — в USDC.
   */
  QUOTE_QUANTITY: number;

  /** Множитель quote-токена: 10^decimals. SOL = 1e9, USDC = 1e6 */
  QUOTE_DECIMALS_MULTIPLIER: number;

  STOP_LOSS_PCT: number;
  BUY_RANGE: number;
  SELL_RANGE: number;

  /** Минимальный notional в единицах quote (SOL) для открытия позиции */
  MIN_NOTIONAL: number;

  TRADE_INTERVAL_MS: number;
  INTERVAL_AFTER_STOPLOSS_MS: number;
  ORDER_TIMEOUT_MS: number;

  ANALIZE_INTERVAL_CANDLES: number;
  CANDLES_INTERVAL: "1m" | "5m" | "10m" | "15m" | "1h";
  LOOCAL_LOOKBACK: number;

  MIN_RANGE_PCT: number;
  MAX_RANGE_PCT: number;
}

/**
 * Quote-токен для пула. WSOL (не нативный SOL):
 * пул DLMM работает с WSOL как SPL-токеном.
 * Нативный SOL автоматически оборачивается SDK при депозите.
 */
export const QUOTE_TOKEN = {
  SYMBOL: "SOL",
  MINT: "So11111111111111111111111111111111111111112",
  DECIMALS: 9,
  /** 10^9 — готовый множитель для raw-конверсий */
  MULTIPLIER: 1_000_000_000,
} as const;

export const COINS_CONFIG: DexCoinConfig[] = [
  {
    SYMBOL: "HELL",
    DECEMIALS: 1_000_000, // HELL: 6 decimals (pump.fun стандарт)
    TOKEN_MINT: "A75Xx6SeftAmWduv9KGwb2GCjXUAhxozcCUCys9jpump",
    POOL_ADDRESS: "2T8psneofbZpmjxp6aY9aa9wh895msL48P15Jz64HB3e",

    // 0.05 SOL ≈ $4.75 — комфортный объём для сетки на pump.fun-меме
    QUOTE_QUANTITY: 0.2,
    QUOTE_DECIMALS_MULTIPLIER: 1_000_000_000,

    STOP_LOSS_PCT: 15,
    BUY_RANGE: 0.1,
    SELL_RANGE: 0.75,

    // 0.01 SOL ≈ $0.95 — минимум, ниже которого не открываем позицию
    MIN_NOTIONAL: 0.01,

    TRADE_INTERVAL_MS: 90_000, // было 60_000 — запас на confirm транзакции
    INTERVAL_AFTER_STOPLOSS_MS: 300_000,
    ORDER_TIMEOUT_MS: 60_000,

    ANALIZE_INTERVAL_CANDLES: 30,
    CANDLES_INTERVAL: "15m",
    LOOCAL_LOOKBACK: 20,

    MIN_RANGE_PCT: 2, // было 1 — на волатильной HELL 1% даёт мгновенный фил
    MAX_RANGE_PCT: 100,
  },
];