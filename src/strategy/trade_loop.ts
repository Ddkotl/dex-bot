import "dotenv/config";

import { analyzeMarket } from "../actions/analize_market";
import { getAssetBalances } from "../get_info/get_balance";
import { getActiveLimitPositions } from "../get_info/get_positions";

import {
  getStoredBuyEntryPrice,
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

      let buyEntryPrice: number | undefined;

      const activePosition = positions[0];

      if (activePosition?.side === "SELL") {
        const storedPrice = getStoredBuyEntryPrice(
          activePosition.positionAddress,
        );

        if (storedPrice === null) {
          throw new Error(
            "SELL открыта, но buyEntryPrice отсутствует. " +
            "Новые действия запрещены до проверки состояния.",
          );
        }

        buyEntryPrice = storedPrice;
      }

      const action = decide({
        config,
        market,
        quoteBalance,
        tokenBalance,
        positions,
        buyEntryPrice,
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