import type { DexCoinConfig } from "../config";
import type { Dlmmpresentation } from "../get_info/get_positions";

export type Action =
  | {
      type: "OPEN_BUY";
      price: number;
      quoteAmount: number;
    }
  | {
      type: "OPEN_SELL";
      price: number;
      tokens: number;
    }
  | {
      type: "SWITCH_TO_BUY";
      positionAddress: string;
      price: number;
      currentPrice: number;
    }
  | {
      type: "SWITCH_TO_SELL";
      positionAddress: string;
      price: number;
      currentPrice: number;
    }
  | {
      type: "STOP_LOSS";
      positionAddress: string;
      currentPrice: number;
      buyEntryPrice: number;
      stopLossPrice: number;
    }
  | {
      type: "NOOP";
      reason: string;
    };

interface MarketData {
  currentPrice: number;
  localMinPrice: number;
  localMaxPrice: number;
  localRange: number;
  rangePct: number;
  driftPct: number;
  isSideways: boolean;
}

interface DecideInput {
  config: DexCoinConfig;
  market: MarketData;
  quoteBalance: number;
  tokenBalance: number;
  positions: Dlmmpresentation[];
  buyEntryPrice?: number | undefined;
}

function noop(reason: string): Action {
  return { type: "NOOP", reason };
}

export function decide(i: DecideInput): Action {
  const {
    config: c,
    market: m,
    quoteBalance,
    tokenBalance,
    positions,
    buyEntryPrice,
  } = i;

  if (positions.length > 1) {
    return noop("Обнаружено несколько DLMM-позиций. Нужна проверка.");
  }

  if (!Number.isFinite(m.currentPrice) || m.currentPrice <= 0) {
    return noop("Некорректная текущая цена.");
  }

  const position = positions[0];

  // Стоп проверяем до обычной логики переключения.
  if (
    position?.side === "SELL" &&
    position.state !== "QUOTE_ONLY" &&
    buyEntryPrice !== undefined
  ) {
    const stopLossPrice = buyEntryPrice * (1 - c.STOP_LOSS_PCT / 100);

    if (m.currentPrice <= stopLossPrice) {
      return {
        type: "STOP_LOSS",
        positionAddress: position.positionAddress,
        currentPrice: m.currentPrice,
        buyEntryPrice,
        stopLossPrice,
      };
    }
  }

  const buyPrice = m.localMinPrice + c.BUY_RANGE * m.localRange;

  const sellPrice = m.localMinPrice + c.SELL_RANGE * m.localRange;

  if (
    !Number.isFinite(buyPrice) ||
    !Number.isFinite(sellPrice) ||
    buyPrice <= 0 ||
    sellPrice <= 0
  ) {
    return noop("Некорректная целевая цена.");
  }

  if (position) {
    if (position.side === "BUY" && position.state === "TOKEN_ONLY") {
      return {
        type: "SWITCH_TO_SELL",
        positionAddress: position.positionAddress,
        price: sellPrice,
        currentPrice: m.currentPrice,
      };
    }

    if (position.side === "SELL" && position.state === "QUOTE_ONLY") {
      return {
        type: "SWITCH_TO_BUY",
        positionAddress: position.positionAddress,
        price: buyPrice,
        currentPrice: m.currentPrice,
      };
    }

    return noop("Ожидание полного исполнения DLMM-позиции.");
  }

  if (!m.isSideways) {
    return noop("Рынок не находится во флэте.");
  }

  if (m.rangePct > c.MAX_RANGE_PCT || m.rangePct < c.MIN_RANGE_PCT) {
    return noop("Диапазон рынка вне допустимых границ.");
  }

  const tokenValue = tokenBalance * m.currentPrice;

  if (tokenValue >= c.MIN_NOTIONAL) {
    return {
      type: "OPEN_SELL",
      price: sellPrice,
      tokens: tokenBalance,
    };
  }

  if (quoteBalance >= c.MIN_NOTIONAL) {
    return {
      type: "OPEN_BUY",
      price: buyPrice,
      quoteAmount: Math.min(c.QUOTE_QUANTITY, quoteBalance),
    };
  }

  return noop("Недостаточный баланс.");
}
