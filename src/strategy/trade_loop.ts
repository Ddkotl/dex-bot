
import "dotenv/config";
import { analyzeMarket } from "../actions/analize_market";
import { getAssetBalances } from "../get_info/get_balance";
import type { DexCoinConfig } from "../config";
import { getActiveLimitPositions } from "../get_info/get_positions";
import { sleep } from "../utits/sleep";
import { decide } from "./decide";

const WALLET_PUB_ADRESS = process.env.WALLET_PUB_ADRESS || "";

// Цвета терминала
const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
};

const useColor = Boolean(process.stdout.isTTY);

function color(text: string, code: string): string {
  return useColor ? `${code}${text}${COLORS.reset}` : text;
}

function number(value: number | undefined, digits = 4): string {
  if (value === undefined || !Number.isFinite(value)) return "n/a";
  return value.toFixed(digits);
}

function timestamp(): string {
  return new Date().toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function printTickHeader(symbol: string): void {
  console.log("");
  console.log(color("━".repeat(64), COLORS.gray));
  console.log(
    `${color("🤖 " + symbol, COLORS.bold + COLORS.cyan)}  ` +
    color(timestamp(), COLORS.dim),
  );
  console.log(color("━".repeat(64), COLORS.gray));
}

function printRow(label: string, value: string): void {
  console.log(`  ${color(label.padEnd(17), COLORS.gray)} ${value}`);
}

function printAction(action: { type: string; reason?: string }): void {
  let actionColor = COLORS.gray;

  if (action.type === "BUY") actionColor = COLORS.green;
  else if (action.type === "SELL") actionColor = COLORS.yellow;
  else if (action.type !== "NOOP") actionColor = COLORS.cyan;

  const actionText = color(
    action.type === "NOOP" ? "⏸ " + action.type : "⚡ " + action.type,
    COLORS.bold + actionColor,
  );

  console.log("");
  console.log(`  ${color("РЕШЕНИЕ", COLORS.bold)}          ${actionText}`);

  if (action.reason) {
    printRow("Причина:", action.reason);
  }
}

export async function tradeLoop(config: DexCoinConfig) {
  const { SYMBOL, TOKEN_MINT, POOL_ADDRESS, TRADE_INTERVAL_MS } = config;

  console.log("");
  console.log(color(`🚀 Запуск торгового робота: ${SYMBOL}`, COLORS.bold + COLORS.green));
  console.log(color(`   Pool: ${POOL_ADDRESS}`, COLORS.dim));
  console.log(color(`   Интервал: ${TRADE_INTERVAL_MS / 1000} сек.`, COLORS.dim));

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

      printTickHeader(SYMBOL);

      if (!market) {
        console.log(color("  ⚠ Нет данных рынка. Тик пропущен.", COLORS.yellow));
        await sleep(TRADE_INTERVAL_MS);
        continue;
      }

      // 2. Балансы
      const quote = balance.sol + balance.wsol;
      const token = balance.token ?? 0;

      // 3. Принимаем решение
      const action = decide({
        config,
        market,
        quoteBalance: quote,
        tokenBalance: token,
        positions,
      });

      // 4. Выводим состояние рынка
      console.log(color("\n  📊 РЫНОК", COLORS.bold + COLORS.cyan));

      printRow("Текущая цена:", `${number(market.currentPrice, 10)} SOL`);
      printRow("Опорная цена:", `${number(market.anchor, 10)} SOL`);
      printRow(
        "Диапазон:",
        `${number(market.minPrice, 10)} — ${number(market.maxPrice, 10)} SOL`,
      );
      printRow("Размах:", `${number(market.rangePct, 2)}%`);
      printRow("Отклонение:", `${number(market.driftPct, 2)}%`);

      const regime = market.isSideways
        ? color("БОКОВИК", COLORS.green)
        : color("ТРЕНД", COLORS.yellow);

      printRow("Режим рынка:", regime);
      printRow("Свечей:", String(market.candleCount));

      // 5. Балансы
      console.log(color("\n  💰 БАЛАНСЫ", COLORS.bold + COLORS.cyan));

      printRow("SOL:", `${number(balance.sol)} SOL`);
      printRow("Wrapped SOL:", `${number(balance.wsol)} WSOL`);
      printRow("Всего quote:", `${number(quote)} SOL`);
      printRow(`${SYMBOL}:`, `${number(token)} ${SYMBOL}`);

      // 6. Активные позиции
      console.log(color("\n  📌 ПОЗИЦИИ", COLORS.bold + COLORS.cyan));

      printRow("Активных:", String(positions.length));

      // 7. Итоговое решение
      printAction(action);

      console.log(color("\n" + "─".repeat(64), COLORS.gray));

      // 8. Исполнение пока отключено
      // if (action.type !== "NOOP") {
      //   await executeAction(action, config, market);
      // }

    } catch (err) {
      console.error(
        color(`\n💥 [${SYMBOL}] ОШИБКА ТИКА`, COLORS.bold + COLORS.red),
      );

      console.error(
        color(
          err instanceof Error ? err.message : String(err),
          COLORS.red,
        ),
      );
    }

    await sleep(TRADE_INTERVAL_MS);
  }
}
