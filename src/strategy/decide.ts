
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
      buyEntryPrice: number;
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
      type: "REFRESH_ORDER";
      positionAddress: string;
      side: "BUY" | "SELL";
      price: number;
      buyEntryPrice?: number;
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
  positionCreatedAt?: number | undefined;
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
    positionCreatedAt,
  } = i;

  if (positions.length > 1) {
    return noop("Обнаружено несколько DLMM-позиций. Нужна проверка.");
  }

  if (!Number.isFinite(m.currentPrice) || m.currentPrice <= 0) {
    return noop("Некорректная текущая цена.");
  }

  const position = positions[0];

  // --------------------------------------------------
  // STOP LOSS
  // --------------------------------------------------

  if (position?.side === "SELL") {
    if (
      buyEntryPrice === undefined ||
      !Number.isFinite(buyEntryPrice) ||
      buyEntryPrice <= 0
    ) {
      return noop(
        "SELL заблокирована: отсутствует корректная цена покупки.",
      );
    }

    if (position.state !== "QUOTE_ONLY") {
      const stopLossPrice =
        buyEntryPrice * (1 - c.STOP_LOSS_PCT / 100);

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
  }

  // --------------------------------------------------
  // TARGET PRICES
  // --------------------------------------------------

  const buyPrice =
    m.localMinPrice + c.BUY_RANGE * m.localRange;

  const sellPrice =
    m.localMinPrice + c.SELL_RANGE * m.localRange;

  if (
    !Number.isFinite(buyPrice) ||
    !Number.isFinite(sellPrice) ||
    buyPrice <= 0 ||
    sellPrice <= 0
  ) {
    return noop("Некорректная целевая цена.");
  }

  // --------------------------------------------------
  // ORDER TIMEOUT
  // --------------------------------------------------

  if (
    position &&
    positionCreatedAt !== undefined &&
    Number.isFinite(positionCreatedAt) &&
    positionCreatedAt > 0 &&
    Date.now() - positionCreatedAt >= c.ORDER_TIMEOUT_MS
  ) {
    const isUnfilledBuy =
      position.side === "BUY" &&
      position.state === "QUOTE_ONLY";

    const isUnfilledSell =
      position.side === "SELL" &&
      position.state === "TOKEN_ONLY";

    if (isUnfilledBuy || isUnfilledSell) {
      // После тайм-аута не открываем новый ордер,
      // если свежий анализ больше не подходит.
      if (
        !m.isSideways ||
        m.rangePct > c.MAX_RANGE_PCT ||
        m.rangePct < c.MIN_RANGE_PCT
      ) {
        return noop(
          "ORDER TIMEOUT: рынок не подходит для обновления ордера. " +
          "Старая позиция остаётся без изменений.",
        );
      }

      if (isUnfilledBuy) {
        return {
          type: "REFRESH_ORDER",
          positionAddress: position.positionAddress,
          side: "BUY",
          price: buyPrice,
        };
      }

      if (
        buyEntryPrice === undefined ||
        !Number.isFinite(buyEntryPrice) ||
        buyEntryPrice <= 0
      ) {
        return noop(
          "ORDER TIMEOUT: невозможно обновить SELL без buyEntryPrice.",
        );
      }

      return {
        type: "REFRESH_ORDER",
        positionAddress: position.positionAddress,
        side: "SELL",
        price: sellPrice,
        buyEntryPrice,
      };
    }
  }

  // --------------------------------------------------
  // POSITION SWITCHES
  // --------------------------------------------------

  if (position) {
    if (
      position.side === "BUY" &&
      position.state === "TOKEN_ONLY"
    ) {
      return {
        type: "SWITCH_TO_SELL",
        positionAddress: position.positionAddress,
        price: sellPrice,
        currentPrice: m.currentPrice,
      };
    }

    if (
      position.side === "SELL" &&
      position.state === "QUOTE_ONLY"
    ) {
      return {
        type: "SWITCH_TO_BUY",
        positionAddress: position.positionAddress,
        price: buyPrice,
        currentPrice: m.currentPrice,
      };
    }

    return noop("Ожидание полного исполнения DLMM-позиции.");
  }

  // --------------------------------------------------
  // NEW POSITIONS
  // --------------------------------------------------

  if (!m.isSideways) {
    return noop("Рынок не находится во флэте.");
  }

  if (
    m.rangePct > c.MAX_RANGE_PCT ||
    m.rangePct < c.MIN_RANGE_PCT
  ) {
    return noop("Диапазон рынка вне допустимых границ.");
  }

  const tokenValue = tokenBalance * m.currentPrice;

  if (tokenValue >= c.MIN_NOTIONAL) {
    if (
      buyEntryPrice === undefined ||
      !Number.isFinite(buyEntryPrice) ||
      buyEntryPrice <= 0
    ) {
      return noop(
        "Есть токены, но цена их покупки неизвестна. OPEN_SELL запрещён.",
      );
    }

    return {
      type: "OPEN_SELL",
      price: sellPrice,
      tokens: tokenBalance,
      buyEntryPrice,
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
