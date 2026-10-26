import type { DexCoinConfig } from "./config";
import { getKlines } from "./get_clines";

export interface MarketRegime {
  candleCount: number;
  lastCandleTime: number;

  currentPrice: number;
  anchor: number;
  minPrice: number;
  maxPrice: number;
  range: number;

  rangePct: number;
  driftPct: number;
  isSideways: boolean;

  localMinPrice: number;
  localMaxPrice: number;
  localRange: number;
}

export async function analyzeMarket(
  config: DexCoinConfig,
): Promise<MarketRegime> {
  const candles = await getKlines(
    config.POOL_ADDRESS,
    config.TOKEN_MINT,
    config.CANDLES_INTERVAL,
    config.ANALIZE_INTERVAL_CANDLES,
  );
 if (candles.length < 2) {
  throw new Error(
    `[${config.SYMBOL}] Not enough candles for analysis`,
  );
}

const lastCandle = candles[candles.length - 1];

if (!lastCandle) {
  throw new Error(
    `[${config.SYMBOL}] Last candle is missing`,
  );
}
  const minPrice = Math.min(...candles.map((c) => c.low));
  const maxPrice = Math.max(...candles.map((c) => c.high));
  const currentPrice = lastCandle.close;

  const anchor = (minPrice + maxPrice) / 2;
  const range = maxPrice - minPrice;

  if (
    !Number.isFinite(currentPrice) ||
    currentPrice <= 0 ||
    anchor <= 0 ||
    range <= 0
  ) {
    throw new Error(`[${config.SYMBOL}] Invalid or flat market data`);
  }

  const localCount = Math.min(
    Math.max(2, Math.floor(config.LOOCAL_LOOKBACK)),
    candles.length,
  );

  const localCandles = candles.slice(-localCount);

  const localMinPrice = Math.min(...localCandles.map((c) => c.low));

  const localMaxPrice = Math.max(...localCandles.map((c) => c.high));

  const localRange = localMaxPrice - localMinPrice;

  const rangePct = (range / anchor) * 100;

  const driftPct = (Math.abs(currentPrice - anchor) / anchor) * 100;


  const isSideways =
    rangePct >= config.MIN_RANGE_PCT &&
    rangePct <= config.MAX_RANGE_PCT ;

  return {
    candleCount: candles.length,
    lastCandleTime: lastCandle.timestamp,

    currentPrice,
    anchor,
    minPrice,
    maxPrice,
    range,

    rangePct,
    driftPct,
    isSideways,

    localMinPrice,
    localMaxPrice,
    localRange,
  };
}
