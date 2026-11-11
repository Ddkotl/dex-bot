
import BN from "bn.js";

import { openLimitPosition } from "../actions/openLimitPosition";
import { closeLimitPosition } from "../actions/closeLimitPosition";

import { getAssetBalances } from "../get_info/get_balance";

import {
  savePosition,
  removePosition,
  getStoredBuyEntryPrice,
} from "../get_info/position_state_store";

import type { DexCoinConfig } from "../config";
import type { Action } from "./decide";

import { loadWalletKeypair } from "../utits/keypair";
import { pub_wallet_connection } from "../client/pub_wallet_connect";
import { swapAllTokenToSol } from "../treasury/swap";

function toRaw(amount: number, multiplier: number): BN {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Некорректная сумма: ${amount}`);
  }

  return new BN(Math.floor(amount * multiplier).toString());
}

export async function executeAction(
  action: Action,
  config: DexCoinConfig,
): Promise<void> {
  if (action.type === "NOOP") return;

  const user = loadWalletKeypair();

  const metadata = {
    symbol: config.SYMBOL,
    tokenMint: config.TOKEN_MINT,
    poolAddress: config.POOL_ADDRESS,
  };

  // --------------------------------------------------
  // OPEN BUY
  // --------------------------------------------------

  const openBuy = async (
    price: number,
    quoteAmount: number,
  ): Promise<string> => {
    const amountRaw = toRaw(
      quoteAmount,
      config.QUOTE_DECIMALS_MULTIPLIER,
    );

    const result = await openLimitPosition({
      connection: pub_wallet_connection,
      poolAddress: config.POOL_ADDRESS,
      user,
      tokenMint: config.TOKEN_MINT,
      side: "buy",
      targetPrice: price,
      amountRaw,
    });

    if (
      !Number.isFinite(result.binPrice) ||
      result.binPrice <= 0
    ) {
      throw new Error(
        `[${config.SYMBOL}] Некорректная цена BUY.`,
      );
    }

    savePosition(
      result.positionAddress,
      "BUY",
      metadata,
      result.binPrice,
      price,
    );

    console.log(
      `[${config.SYMBOL}] BUY сохранён. ` +
      `address=${result.positionAddress}, ` +
      `bin=${result.binId}, ` +
      `entry=${result.binPrice}`,
    );

    return result.positionAddress;
  };

  // --------------------------------------------------
  // OPEN SELL
  // --------------------------------------------------

  const openSell = async (
    price: number,
    tokens: number,
    buyEntryPrice: number,
  ): Promise<string> => {
    if (
      !Number.isFinite(buyEntryPrice) ||
      buyEntryPrice <= 0
    ) {
      throw new Error(
        `[${config.SYMBOL}] SELL запрещена: нет цены BUY.`,
      );
    }

    const amountRaw = toRaw(
      tokens,
      10 ** config.TOKEN_DECIMALS,
    );

    const result = await openLimitPosition({
      connection: pub_wallet_connection,
      poolAddress: config.POOL_ADDRESS,
      user,
      tokenMint: config.TOKEN_MINT,
      side: "sell",
      targetPrice: price,
      amountRaw,
    });

    savePosition(
      result.positionAddress,
      "SELL",
      metadata,
      buyEntryPrice,
      price,
    );

    console.log(
      `[${config.SYMBOL}] SELL сохранён. ` +
      `address=${result.positionAddress}, ` +
      `bin=${result.binId}, ` +
      `BUY entry=${buyEntryPrice}`,
    );

    return result.positionAddress;
  };

  // --------------------------------------------------
  // OPEN BUY
  // --------------------------------------------------

  if (action.type === "OPEN_BUY") {
    await openBuy(action.price, action.quoteAmount);
    return;
  }

  // --------------------------------------------------
  // OPEN SELL
  // --------------------------------------------------

  if (action.type === "OPEN_SELL") {
    await openSell(
      action.price,
      action.tokens,
      action.buyEntryPrice,
    );

    return;
  }

  // --------------------------------------------------
  // REFRESH EXPIRED ORDER
  // --------------------------------------------------

  if (action.type === "REFRESH_ORDER") {
    const oldPositionAddress = action.positionAddress;

    console.log(
      `[${config.SYMBOL}] ORDER TIMEOUT: обновляем ${action.side}. ` +
      `Старая позиция=${oldPositionAddress}, ` +
      `новая цена=${action.price}`,
    );

    let buyEntryPrice: number | null = null;

    if (action.side === "SELL") {
      buyEntryPrice = getStoredBuyEntryPrice(oldPositionAddress);

      if (
        buyEntryPrice === null ||
        !Number.isFinite(buyEntryPrice) ||
        buyEntryPrice <= 0
      ) {
        throw new Error(
          `[${config.SYMBOL}] Нельзя обновить SELL: ` +
          `отсутствует buyEntryPrice.`,
        );
      }

      if (
        action.buyEntryPrice === undefined ||
        Math.abs(action.buyEntryPrice - buyEntryPrice) > 1e-12
      ) {
        throw new Error(
          `[${config.SYMBOL}] buyEntryPrice изменился. ` +
          `Обновление SELL отменено.`,
        );
      }
    }

    // 1. Закрываем старую позицию.
    await closeLimitPosition({
      connection: pub_wallet_connection,
      poolAddress: config.POOL_ADDRESS,
      user,
      positionAddress: oldPositionAddress,
    });

    // 2. Получаем фактические балансы после закрытия.
    const balance = await getAssetBalances(
      user.publicKey.toBase58(),
      config.TOKEN_MINT,
      config.SYMBOL,
    );

    // 3. Создаём новую позицию.
    if (action.side === "BUY") {
      const quoteBalance = balance.sol + balance.wsol;

      if (quoteBalance < config.MIN_NOTIONAL) {
        throw new Error(
          `[${config.SYMBOL}] Старая BUY закрыта, ` +
          `но недостаточно SOL/WSOL для новой BUY. ` +
          `Старая запись сохранена: ${oldPositionAddress}`,
        );
      }

      await openBuy(
        action.price,
        Math.min(config.QUOTE_QUANTITY, quoteBalance),
      );
    } else {
      const tokens = balance.token ?? 0;

      if (tokens * action.price < config.MIN_NOTIONAL) {
        throw new Error(
          `[${config.SYMBOL}] Старая SELL закрыта, ` +
          `но недостаточно токенов для новой SELL. ` +
          `Старая запись сохранена: ${oldPositionAddress}`,
        );
      }

      await openSell(
        action.price,
        tokens,
        buyEntryPrice!,
      );
    }

    // 4. Новая запись уже сохранена.
    // Только теперь удаляем старую.
    removePosition(oldPositionAddress);

    console.log(
      `[${config.SYMBOL}] ORDER TIMEOUT: ` +
      `${action.side} успешно пересоздана.`,
    );

    return;
  }

  // --------------------------------------------------
  // BUY -> SELL
  // --------------------------------------------------

  if (action.type === "SWITCH_TO_SELL") {
    const buyEntryPrice = getStoredBuyEntryPrice(
      action.positionAddress,
    );

    if (
      buyEntryPrice === null ||
      !Number.isFinite(buyEntryPrice) ||
      buyEntryPrice <= 0
    ) {
      throw new Error(
        `[${config.SYMBOL}] BUY -> SELL отменено: ` +
        `не найдена цена покупки.`,
      );
    }

    console.log(
      `[${config.SYMBOL}] BUY -> SELL. ` +
      `Сохраняем BUY entry=${buyEntryPrice}`,
    );

    await closeLimitPosition({
      connection: pub_wallet_connection,
      poolAddress: config.POOL_ADDRESS,
      user,
      positionAddress: action.positionAddress,
    });

    const balance = await getAssetBalances(
      user.publicKey.toBase58(),
      config.TOKEN_MINT,
      config.SYMBOL,
    );

    if (
      balance.token * action.currentPrice <
      config.MIN_NOTIONAL
    ) {
      throw new Error(
        `[${config.SYMBOL}] После закрытия BUY ` +
        `недостаточно токенов для SELL. ` +
        `Старая цена BUY сохранена.`,
      );
    }

    await openSell(
      action.price,
      balance.token,
      buyEntryPrice,
    );

    removePosition(action.positionAddress);

    console.log(
      `[${config.SYMBOL}] BUY -> SELL завершено. ` +
      `BUY entry=${buyEntryPrice}`,
    );

    return;
  }

  // --------------------------------------------------
  // SELL -> BUY
  // --------------------------------------------------

  if (action.type === "SWITCH_TO_BUY") {
    console.log(
      `[${config.SYMBOL}] SELL -> BUY: ` +
      `закрываем ${action.positionAddress}`,
    );

    await closeLimitPosition({
      connection: pub_wallet_connection,
      poolAddress: config.POOL_ADDRESS,
      user,
      positionAddress: action.positionAddress,
    });

    const balance = await getAssetBalances(
      user.publicKey.toBase58(),
      config.TOKEN_MINT,
      config.SYMBOL,
    );

    const quoteBalance = balance.sol + balance.wsol;

    if (quoteBalance < config.MIN_NOTIONAL) {
      throw new Error(
        `[${config.SYMBOL}] Недостаточно SOL/WSOL для BUY.`,
      );
    }

    await openBuy(
      action.price,
      Math.min(config.QUOTE_QUANTITY, quoteBalance),
    );

    removePosition(action.positionAddress);

    console.log(
      `[${config.SYMBOL}] SELL -> BUY завершено.`,
    );

    return;
  }

  // --------------------------------------------------
  // STOP LOSS
  // --------------------------------------------------

  if (action.type === "STOP_LOSS") {
    console.error(
      `[${config.SYMBOL}] STOP LOSS! ` +
      `current=${action.currentPrice}, ` +
      `entry=${action.buyEntryPrice}, ` +
      `stop=${action.stopLossPrice}`,
    );

    const storedPrice = getStoredBuyEntryPrice(
      action.positionAddress,
    );

    if (
      storedPrice === null ||
      Math.abs(storedPrice - action.buyEntryPrice) > 1e-12
    ) {
      throw new Error(
        `[${config.SYMBOL}] STOP LOSS отменён: ` +
        `сохранённая цена BUY не совпадает с расчётной.`,
      );
    }

    await closeLimitPosition({
      connection: pub_wallet_connection,
      poolAddress: config.POOL_ADDRESS,
      user,
      positionAddress: action.positionAddress,
    });

    await swapAllTokenToSol(
      pub_wallet_connection,
      user,
      config.TOKEN_MINT,
      100,
    );

    removePosition(action.positionAddress);

    console.log(
      `[${config.SYMBOL}] STOP LOSS завершён. ` +
      `Запись SELL удалена.`,
    );

    return;
  }
}
