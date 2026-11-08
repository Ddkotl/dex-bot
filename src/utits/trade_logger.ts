import type { DexCoinConfig } from "../config";
import type { TokenBalances } from "../get_info/get_balance";
import type { analyzeMarket } from "../actions/analize_market";
import type { Dlmmpresentation } from "../get_info/get_positions";

type MarketData = NonNullable<Awaited<ReturnType<typeof analyzeMarket>>>;

interface TradeAction {
  type: string;
  reason?: string;
}

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
  if (value === undefined || !Number.isFinite(value)) {
    return "n/a";
  }

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

function printRow(label: string, value: string): void {
  console.log(`  ${color(label.padEnd(17), COLORS.gray)} ${value}`);
}

function printHeader(symbol: string): void {
  console.log("");
  console.log(color("━".repeat(64), COLORS.gray));

  console.log(
    `${color("🤖 " + symbol, COLORS.bold + COLORS.cyan)}  ` +
      color(timestamp(), COLORS.dim),
  );

  console.log(color("━".repeat(64), COLORS.gray));
}

function printMarket(market: MarketData): void {
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
}

function printBalances(symbol: string, balance: TokenBalances): void {
  const quote = balance.sol + balance.wsol;

  console.log(color("\n  💰 БАЛАНСЫ", COLORS.bold + COLORS.cyan));

  printRow("SOL:", `${number(balance.sol)} SOL`);
  printRow("Wrapped SOL:", `${number(balance.wsol)} WSOL`);
  printRow("Всего quote:", `${number(quote)} SOL`);

  printRow(`${symbol}:`, `${number(balance.token, 8)} ${symbol}`);
}

function printPositions(positions: Dlmmpresentation[]): void {
  console.log(color("\n  📌 ПОЗИЦИИ", COLORS.bold + COLORS.cyan));

  if (positions.length === 0) {
    printRow("Активных:", color("Нет", COLORS.dim));
    return;
  }

  printRow("Активных:", String(positions.length));

  positions.forEach((position, index) => {
    const direction = position.isBuyOrder
      ? color("BUY", COLORS.green)
      : position.isSellOrder
        ? color("SELL", COLORS.yellow)
        : color("НЕ ОПРЕДЕЛЁН", COLORS.gray);

    console.log("");
    console.log(`  ${color(`Ордер #${index + 1}`, COLORS.bold)} ${direction}`);

    printRow(
      "Адрес:",
      `${position.positionAddress.slice(0, 8)}...${position.positionAddress.slice(-8)}`,
    );

    printRow("Токены:", `${number(position.totalTokens, 8)} HELL`);

    printRow("Quote:", `${number(position.totalQuote, 8)} SOL`);

    printRow("Комиссия HELL:", `${number(position.feeTokens, 8)}`);

    printRow("Комиссия SOL:", `${number(position.feeQuote, 8)}`);

    printRow("Количество бинов:", String(position.binCount));

    printRow(
      "Диапазон bin ID:",
      position.firstBinId !== null && position.lastBinId !== null
        ? `${position.firstBinId} — ${position.lastBinId}`
        : "не определён",
    );
  });
}

function printAction(action: TradeAction): void {
  let actionColor = COLORS.gray;

  if (action.type === "BUY") {
    actionColor = COLORS.green;
  } else if (action.type === "SELL") {
    actionColor = COLORS.yellow;
  } else if (action.type !== "NOOP") {
    actionColor = COLORS.cyan;
  }

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

export function logBotStart(config: DexCoinConfig): void {
  console.log("");

  console.log(
    color(
      `🚀 Запуск торгового робота: ${config.SYMBOL}`,
      COLORS.bold + COLORS.green,
    ),
  );

  console.log(color(`   Pool: ${config.POOL_ADDRESS}`, COLORS.dim));

  console.log(
    color(`   Интервал: ${config.TRADE_INTERVAL_MS / 1000} сек.`, COLORS.dim),
  );
}

export function logNoMarket(symbol: string): void {
  printHeader(symbol);

  console.log(color("  ⚠ Нет данных рынка. Тик пропущен.", COLORS.yellow));
}

export function logTradeTick(params: {
  symbol: string;
  market: MarketData;
  balance: TokenBalances;
  positions: Dlmmpresentation[];
  action: TradeAction;
}): void {
  const {
    symbol,
    market,
    balance,
    positions,
    action,
  } = params;

  printHeader(symbol);

  printMarket(market);
  printBalances(symbol, balance);
  printPositions(positions);
  printAction(action);

  console.log(color("\n" + "─".repeat(64), COLORS.gray));
}

export function logTradeError(symbol: string, error: unknown): void {
  console.error(
    color(`\n💥 [${symbol}] ОШИБКА ТИКА`, COLORS.bold + COLORS.red),
  );

  console.error(
    color(error instanceof Error ? error.message : String(error), COLORS.red),
  );
}
