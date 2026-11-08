import type { DexCoinConfig } from "../config";
import type {
  Dlmmpresentation,
  PositionState,
} from "../get_info/get_positions";

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
}

function getPositionAction(
  position: Dlmmpresentation,
  buyPrice: number,
  sellPrice: number,
  currentPrice: number,
): Action {
  if (position.side === "BUY" && position.state === "TOKEN_ONLY") {
    return {
      type: "SWITCH_TO_SELL",
      positionAddress: position.positionAddress,
      price: sellPrice,
      currentPrice,
    };
  }

  if (position.side === "SELL" && position.state === "QUOTE_ONLY") {
    return {
      type: "SWITCH_TO_BUY",
      positionAddress: position.positionAddress,
      price: buyPrice,
      currentPrice,
    };
  }

  const state: PositionState = position.state;

  return {
    type: "NOOP",
    reason: `position ${position.side}/${state}: waiting for full conversion`,
  };
}

export function decide(i: DecideInput): Action {
  const { config: c, market: m, quoteBalance, tokenBalance, positions } = i;

  if (positions.length > 1) {
    return {
      type: "NOOP",
      reason: `found ${positions.length} positions; manual review required`,
    };
  }

  const buyPrice = m.localMinPrice + c.BUY_RANGE * m.localRange;

  const sellPrice = m.localMinPrice + c.SELL_RANGE * m.localRange;

  if (
    !Number.isFinite(buyPrice) ||
    !Number.isFinite(sellPrice) ||
    buyPrice <= 0 ||
    sellPrice <= 0
  ) {
    return {
      type: "NOOP",
      reason: "invalid target prices",
    };
  }

  // Существующей позиции даём завершить конвертацию,
  // даже если рыночные фильтры временно перестали выполняться.
  const position = positions[0];

  if (position) {
    return getPositionAction(position, buyPrice, sellPrice, m.currentPrice);
  }

  // Фильтры применяем только при открытии новой позиции.
  if (!m.isSideways) {
    return { type: "NOOP", reason: "not sideways" };
  }

  if (m.rangePct > c.MAX_RANGE_PCT) {
    return {
      type: "NOOP",
      reason: `range ${m.rangePct.toFixed(1)}% > MAX`,
    };
  }

  if (m.rangePct < c.MIN_RANGE_PCT) {
    return {
      type: "NOOP",
      reason: `range ${m.rangePct.toFixed(1)}% < MIN`,
    };
  }

  const tokenValue = tokenBalance * m.currentPrice;

  // Если на кошельке достаточно base-токена — ставим SELL.
  if (tokenValue >= c.MIN_NOTIONAL) {
    return {
      type: "OPEN_SELL",
      price: sellPrice,
      tokens: tokenBalance,
    };
  }

  // Иначе используем quote-баланс для BUY.
  if (quoteBalance >= c.MIN_NOTIONAL) {
    return {
      type: "OPEN_BUY",
      price: buyPrice,
      quoteAmount: Math.min(c.QUOTE_QUANTITY, quoteBalance),
    };
  }

  return {
    type: "NOOP",
    reason: "both balances below MIN_NOTIONAL",
  };
}
