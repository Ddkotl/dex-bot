export interface DexCoinConfig {
  SYMBOL: string;
  DECEMIALS:number;
  TOKEN_MINT: string;
  POOL_ADDRESS: string;

  // Только параметры будущей бумажной торговли
  USDC_QUANTITY: number;
  STOP_LOSS_PCT: number;
  BUY_RANGE: number;
  SELL_RANGE: number;

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

export const QUOTE_TOKEN = {
  SYMBOL: "USDC",
  MINT: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
} as const;

export const COINS_CONFIG: DexCoinConfig[] = [
  {
    SYMBOL: "HELL", // отображаемый тикер; идентичность задаётся mint
    DECEMIALS: 1_000_000,
    TOKEN_MINT: "A75Xx6SeftAmWduv9KGwb2GCjXUAhxozcCUCys9jpump",
    POOL_ADDRESS: "2T8psneofbZpmjxp6aY9aa9wh895msL48P15Jz64HB3e",

    USDC_QUANTITY: 5,
    STOP_LOSS_PCT: 15,
    BUY_RANGE: 0.1,
    SELL_RANGE: 0.75,

    MIN_NOTIONAL: 1.5,
    TRADE_INTERVAL_MS: 60_000,
    INTERVAL_AFTER_STOPLOSS_MS: 300_000,
    ORDER_TIMEOUT_MS: 60_000,

    ANALIZE_INTERVAL_CANDLES: 20,
    CANDLES_INTERVAL: "15m",
    LOOCAL_LOOKBACK: 20,

    MIN_RANGE_PCT: 1,
    MAX_RANGE_PCT: 100,
  },
];
