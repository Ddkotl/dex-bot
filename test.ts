
import { COINS_CONFIG } from "./src/config";
import { analyzeMarket } from "./src/analize_market";

async function main() {
  for (const config of COINS_CONFIG) {
    console.log(`\nАнализ ${config.SYMBOL}`);
    console.log(`Пул: ${config.POOL_ADDRESS}`);

    try {
      const market = await analyzeMarket(config);

      console.log({
        candles: market.candleCount,
        lastCandleTime: new Date(
          market.lastCandleTime * 1000,
        ).toISOString(),
        priceUsd: market.currentPrice,
        minPriceUsd: market.minPrice,
        maxPriceUsd: market.maxPrice,
        rangePct: market.rangePct,
        driftPct: market.driftPct,
        isSideways: market.isSideways,
        localMinPrice: market.localMinPrice,
        localMaxPrice: market.localMaxPrice,
      });
    } catch (error) {
      console.error(
        `[${config.SYMBOL}]`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}

main().catch(console.error);
