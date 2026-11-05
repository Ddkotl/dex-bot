// src/strategy/tradeLoop.ts
import "dotenv/config";
import { analyzeMarket } from "../actions/analize_market";
import { getAssetBalances } from "../get_info/get_balance";
import type { DexCoinConfig } from "../config";
import { getActiveLimitPositions } from "../get_info/get_positions";
import { sleep } from "../utits/sleep";
import { decide } from "./decide";
import { executeAction } from "./execute";

const WALLET_PUB_ADRESS = process.env.WALLET_PUB_ADRESS || "";

export async function tradeLoop(config: DexCoinConfig) {
  const { SYMBOL, TOKEN_MINT, POOL_ADDRESS, TRADE_INTERVAL_MS } = config;

  console.log(`🚀 Робот запущен для ${SYMBOL} (stateless, real trading)`);

  while (true) {
    try {
      // ── 1. Снимаем ВСЁ с цепи каждый тик ────────────
      const [market, balance, positions] = await Promise.all([
        analyzeMarket(config),
        getAssetBalances(WALLET_PUB_ADRESS, TOKEN_MINT),
        getActiveLimitPositions(
          POOL_ADDRESS,
          WALLET_PUB_ADRESS,
          config.DECEMIALS,
        ),
      ]);

      if (!market) {
        console.log(`[${SYMBOL}] нет данных рынка, пропуск`);
        await sleep(TRADE_INTERVAL_MS);
        continue;
      }

      const quote = balance.sol + balance.wsol; // нативный + уже обёрнутый
      const token = balance.token ?? 0;

      const action = decide({
        config,
        market,
        quoteBalance: quote, // ← семантически теперь SOL, но поле в decide
        //    можно переименовать в quoteBalance позже
        tokenBalance: token,
        positions,
      });

      console.log(
        `[${SYMBOL}] price=${market.currentPrice.toFixed(8)} ` +
          `sideways=${market.isSideways} range=${market.rangePct.toFixed(1)}% ` +
          `pos=${positions.length} ` +
          `sol=${balance.sol.toFixed(4)} wsol=${balance.wsol.toFixed(4)} ` +
          `token=${token.toFixed(4)} ` +
          `→ ${action.type}${action.type === "NOOP" ? ` (${action.reason})` : ""}`,
      );

      // // ── 3. Исполнение (с ожиданием confirm) ─────────
      // if (action.type !== "NOOP") {
      //   await executeAction(action, config, market);
      // }
    } catch (err) {
      console.error(
        `💥 [${SYMBOL}] tick error:`,
        err instanceof Error ? err.message : err,
      );
    }

    await sleep(TRADE_INTERVAL_MS);
  }
}
