
import "dotenv/config";

import { analyzeMarket } from "../actions/analize_market";
import { getAssetBalances } from "../get_info/get_balance";
import { getActiveLimitPositions } from "../get_info/get_positions";

import {
  getStoredBuyEntryPrice,
  getStoredBuyEntryPriceForPool,
  getStoredPositionsForPool,
  getStoredPosition,
} from "../get_info/position_state_store";

import type { DexCoinConfig } from "../config";

import { sleep } from "../utits/sleep";

import {
  logBotStart,
  logNoMarket,
  logTradeError,
  logTradeTick,
} from "../utits/trade_logger";

import { decide } from "./decide";
import { executeAction } from "./execute";

const WALLET_PUB_ADRESS = process.env.WALLET_PUB_ADRESS || "";
const ENABLE_TRADING = process.env.ENABLE_TRADING === "true";

export async function tradeLoop(config: DexCoinConfig) {
  const {
    SYMBOL,
    TOKEN_MINT,
    POOL_ADDRESS,
    TRADE_INTERVAL_MS,
  } = config;

  if (!WALLET_PUB_ADRESS) {
    throw new Error("WALLET_PUB_ADRESS не задан в .env");
  }

  logBotStart(config);

  console.log(
    `[${SYMBOL}] Trading execution: ${
      ENABLE_TRADING ? "ENABLED" : "DISABLED"
    }`,
  );

  while (true) {
    try {
      const [market, balance, positions] = await Promise.all([
        analyzeMarket(config),

        getAssetBalances(
          WALLET_PUB_ADRESS,
          TOKEN_MINT,
          SYMBOL,
        ),

        getActiveLimitPositions(
          POOL_ADDRESS,
          WALLET_PUB_ADRESS,
          TOKEN_MINT,
          config.TOKEN_DECIMALS,
          9,
        ),
      ]);

      if (!market) {
        logNoMarket(SYMBOL);
        await sleep(TRADE_INTERVAL_MS);
        continue;
      }

      const quoteBalance = balance.sol + balance.wsol;
      const tokenBalance = balance.token ?? 0;

      const activePosition = positions[0];

      const storedPositions =
        getStoredPositionsForPool(POOL_ADDRESS);

      let buyEntryPrice =
        getStoredBuyEntryPriceForPool(POOL_ADDRESS) ??
        undefined;

      let positionCreatedAt: number | undefined;

      // Получаем состояние именно активной позиции.
      if (activePosition) {
        const storedPosition = getStoredPosition(
          activePosition.positionAddress,
        );

        positionCreatedAt = storedPosition?.createdAt;

        if (activePosition.side === "SELL") {
          const positionPrice = getStoredBuyEntryPrice(
            activePosition.positionAddress,
          );

          if (positionPrice !== null) {
            buyEntryPrice = positionPrice;
          }

          if (
            buyEntryPrice === undefined ||
            !Number.isFinite(buyEntryPrice) ||
            buyEntryPrice <= 0
          ) {
            throw new Error(
              `[${SYMBOL}] SELL без buyEntryPrice. ` +
              `Торговля заблокирована до восстановления цены покупки.`,
            );
          }
        }
      }

      // Если активной позиции нет, проверяем сохранённые записи.
      if (!activePosition && storedPositions.length > 0) {
        const hasStoredSell = storedPositions.some(
          ({ position }) => position.side === "SELL",
        );

        if (hasStoredSell) {
          throw new Error(
            `[${SYMBOL}] В JSON есть SELL, но активная DLMM-позиция ` +
            `не найдена. Возможен незавершённый выход или ошибка RPC. ` +
            `Автоматическая торговля заблокирована для проверки.`,
          );
        }

        const hasStoredBuy = storedPositions.some(
          ({ position }) => position.side === "BUY",
        );

        if (
          hasStoredBuy &&
          tokenBalance * market.currentPrice < config.MIN_NOTIONAL
        ) {
          throw new Error(
            `[${SYMBOL}] Найдена сохранённая BUY без активной позиции, ` +
            `но токенов недостаточно для SELL. ` +
            `Проверь состояние кошелька и position_state.json.`,
          );
        }
      }

      const action = decide({
        config,
        market,
        quoteBalance,
        tokenBalance,
        positions,
        buyEntryPrice,
        positionCreatedAt,
      });

      logTradeTick({
        symbol: SYMBOL,
        market,
        balance,
        positions,
        action,
      });

      if (action.type !== "NOOP") {
        if (ENABLE_TRADING) {
          await executeAction(action, config);

          if (action.type === "STOP_LOSS") {
            console.log(
              `[${SYMBOL}] Пауза после STOP LOSS: ` +
              `${config.INTERVAL_AFTER_STOPLOSS_MS} ms`,
            );

            await sleep(config.INTERVAL_AFTER_STOPLOSS_MS);
          }
        } else {
          console.log(
            `[${SYMBOL}] DRY RUN: ${JSON.stringify(action)}`,
          );
        }
      }
    } catch (error) {
      logTradeError(SYMBOL, error);
    }

    await sleep(TRADE_INTERVAL_MS);
  }
}
