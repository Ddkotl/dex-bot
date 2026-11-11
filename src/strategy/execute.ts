
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

  return new BN(
    Math.floor(amount * multiplier).toString(),
  );
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
  ): Promise<void> => {
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
    );

    console.log(
      `[${config.SYMBOL}] BUY сохранён. ` +
      `address=${result.positionAddress}, ` +
      `bin=${result.binId}, ` +
      `entry=${result.binPrice}`,
    );
  };

  // --------------------------------------------------
  // OPEN SELL
  // --------------------------------------------------

  const openSell = async (
    price: number,
    tokens: number,
    buyEntryPrice: number,
  ): Promise<void> => {
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

    // Сначала сохраняем SELL с исходной ценой BUY.
    savePosition(
      result.positionAddress,
      "SELL",
      metadata,
      buyEntryPrice,
    );

    console.log(
      `[${config.SYMBOL}] SELL сохранён. ` +
      `address=${result.positionAddress}, ` +
      `bin=${result.binId}, ` +
      `BUY entry=${buyEntryPrice}`,
    );
  };

  // --------------------------------------------------
  // OPEN BUY
  // --------------------------------------------------

  if (action.type === "OPEN_BUY") {
    await openBuy(
      action.price,
      action.quoteAmount,
    );

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

    // 1. Закрываем BUY on-chain.
    await closeLimitPosition({
      connection: pub_wallet_connection,
      poolAddress: config.POOL_ADDRESS,
      user,
      positionAddress: action.positionAddress,
    });

    // ВАЖНО: старую запись BUY пока НЕ удаляем.

    // 2. Проверяем фактический баланс токенов.
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

    // 3. Открываем SELL и переносим цену BUY.
    // Если открытие не удастся, старая запись останется.
    await openSell(
      action.price,
      balance.token,
      buyEntryPrice,
    );

    // 4. Удаляем BUY только после успешного сохранения SELL.
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

    // 1. Закрываем старую SELL.
    await closeLimitPosition({
      connection: pub_wallet_connection,
      poolAddress: config.POOL_ADDRESS,
      user,
      positionAddress: action.positionAddress,
    });

    // 2. Получаем актуальный баланс.
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

    // 3. Открываем новую BUY.
    await openBuy(
      action.price,
      Math.min(
        config.QUOTE_QUANTITY,
        quoteBalance,
      ),
    );

    // 4. Удаляем старую SELL только после успешного открытия BUY.
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

    // Проверяем, что цена входа не потерялась и не изменилась.
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

    // 1. Закрываем SELL.
    await closeLimitPosition({
      connection: pub_wallet_connection,
      poolAddress: config.POOL_ADDRESS,
      user,
      positionAddress: action.positionAddress,
    });

    // 2. Продаём остаток токенов в SOL.
    await swapAllTokenToSol(
      pub_wallet_connection,
      user,
      config.TOKEN_MINT,
      100,
    );

    // 3. Удаляем запись только после успешного выхода.
    removePosition(action.positionAddress);

    console.log(
      `[${config.SYMBOL}] STOP LOSS завершён. ` +
      `Запись SELL удалена.`,
    );

    return;
  }
}
