import { analyzeMarket } from "./analize_market";
import type { DexCoinConfig } from "./config";
import { getAssetBalances } from "./get_info/get_balance";
import { getActiveLimitPositions } from "./get_info/get_positions";
import { sleep } from "./utits/sleep";
import "dotenv/config";

const WALLET_PUB_ADRESS = process.env.WALLET_PUB_ADRESS || "";
export async function tradeLoop(config: DexCoinConfig) {
  const {
    SYMBOL,
    TOKEN_MINT,
    POOL_ADDRESS,
    TRADE_INTERVAL_MS,
    BUY_RANGE,
    SELL_RANGE,
    USDC_QUANTITY,
    DECEMIALS,
  } = config;

  console.log(`🚀 Робот запущен для пары ${SYMBOL} в Stateless-режиме.`);

  while (true) {
    try {
      // ==========================================
      // 1. СБОР СВЕЖИХ ДАННЫХ С СЕРВЕРА
      // ==========================================
      const market = await analyzeMarket(config);
      console.log(market);
      if (!market) continue;

      const balance = await getAssetBalances(WALLET_PUB_ADRESS, TOKEN_MINT);
      console.log(balance);
      if (balance.token === null || balance.usdc === null) {
        console.log(
          `⚠️ [${SYMBOL}] Не удалось собрать все данные с биржи. Пропускаем тик...`,
        );
        await sleep(TRADE_INTERVAL_MS);
        continue;
      }

      console.log(`[Сетка] Сканируем активные позиции в пуле ${SYMBOL}...`);
      const activeOrders = await getActiveLimitPositions(
        POOL_ADDRESS,
        WALLET_PUB_ADRESS,
        DECEMIALS,
      );

      if (activeOrders.length === 0) {
        console.log(
          `[Сетка] У вас нет открытых лимитных позиций на смарт-контракте.`,
        );
      } else {
        console.log(
          `[Сетка] Найденные открытые ордера (${activeOrders.length}):`,
        );
        console.dir(activeOrders, { depth: null });
      }
      const currentPrice = market.currentPrice;
      const coinValueInUsdc = balance.token * currentPrice;
    } catch (error) {
      console.error(`💥 Критическая ошибка в цикле тика для ${SYMBOL}:`, error);
    }

    await sleep(TRADE_INTERVAL_MS);
  }
}
