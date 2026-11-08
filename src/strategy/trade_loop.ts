import "dotenv/config";

import { analyzeMarket } from "../actions/analize_market";
import { getAssetBalances } from "../get_info/get_balance";
import type { DexCoinConfig } from "../config";
import { getActiveLimitPositions } from "../get_info/get_positions";
import { sleep } from "../utits/sleep";
import {
  logBotStart,
  logNoMarket,
  logTradeError,
  logTradeTick,
} from "../utits/trade_logger";

import { decide } from "./decide";

const WALLET_PUB_ADRESS = process.env.WALLET_PUB_ADRESS || "";

export async function tradeLoop(config: DexCoinConfig) {
  const { SYMBOL, TOKEN_MINT, POOL_ADDRESS, TRADE_INTERVAL_MS } = config;

  logBotStart(config);

  while (true) {
    try {
      // 1. Получаем актуальные данные
      const [market, balance, positions] = await Promise.all([
        analyzeMarket(config),

        getAssetBalances(WALLET_PUB_ADRESS, TOKEN_MINT),

        getActiveLimitPositions(
          POOL_ADDRESS,
          WALLET_PUB_ADRESS,
          config.TOKEN_DECIMALS,
        ),
      ]);

      // 2. Проверяем рынок
      if (!market) {
        logNoMarket(SYMBOL);
        await sleep(TRADE_INTERVAL_MS);
        continue;
      }

      // 3. Балансы
      const quote = balance.sol + balance.wsol;
      const token = balance.token ?? 0;

      // 4. Принимаем торговое решение
      const action = decide({
        config,
        market,
        quoteBalance: quote,
        tokenBalance: token,
        positions,
      });

      // 5. Выводим информацию о тике
      logTradeTick({
        symbol: SYMBOL,
        market,
        balance,
        positions,
        action,
      });

      // 6. Исполнение сделок пока отключено
      // if (action.type !== "NOOP") {
      //   await executeAction(action, config, market);
      // }
    } catch (error) {
      logTradeError(SYMBOL, error);
    }

    // 7. Ждём следующий тик
    await sleep(TRADE_INTERVAL_MS);
  }
}
