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

  const openBuy = async (price: number, quoteAmount: number): Promise<void> => {
    const amountRaw = toRaw(quoteAmount, config.QUOTE_DECIMALS_MULTIPLIER);

    const result = await openLimitPosition({
      connection: pub_wallet_connection,
      poolAddress: config.POOL_ADDRESS,
      user,
      tokenMint: config.TOKEN_MINT,
      side: "buy",
      targetPrice: price,
      amountRaw,
    });

    savePosition(result.positionAddress, "BUY", result.binPrice);

    console.log(
      `[${config.SYMBOL}] BUY сохранён. ` +
        `bin=${result.binId}, entry=${result.binPrice}`,
    );
  };

  const openSell = async (
    price: number,
    tokens: number,
    buyEntryPrice?: number,
  ): Promise<void> => {
    const amountRaw = toRaw(tokens, 10 ** config.TOKEN_DECIMALS);

    const result = await openLimitPosition({
      connection: pub_wallet_connection,
      poolAddress: config.POOL_ADDRESS,
      user,
      tokenMint: config.TOKEN_MINT,
      side: "sell",
      targetPrice: price,
      amountRaw,
    });

    savePosition(result.positionAddress, "SELL", buyEntryPrice);

    console.log(
      `[${config.SYMBOL}] SELL сохранён. ` +
        `bin=${result.binId}, BUY entry=${buyEntryPrice ?? "не задан"}`,
    );
  };

  if (action.type === "OPEN_BUY") {
    await openBuy(action.price, action.quoteAmount);
    return;
  }

  if (action.type === "OPEN_SELL") {
    await openSell(action.price, action.tokens);
    return;
  }

  if (action.type === "SWITCH_TO_SELL") {
    const buyEntryPrice = getStoredBuyEntryPrice(action.positionAddress);

    if (buyEntryPrice === null) {
      throw new Error("Не найдена цена BUY. Переключение на SELL отменено.");
    }

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

    if (balance.token * action.currentPrice < config.MIN_NOTIONAL) {
      throw new Error("После закрытия BUY недостаточно токенов для SELL.");
    }

    await openSell(action.price, balance.token, buyEntryPrice);

    removePosition(action.positionAddress);
    return;
  }

  if (action.type === "SWITCH_TO_BUY") {
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
      throw new Error("Недостаточно SOL/WSOL для BUY.");
    }

    await openBuy(action.price, Math.min(config.QUOTE_QUANTITY, quoteBalance));

    removePosition(action.positionAddress);
    return;
  }

  if (action.type === "STOP_LOSS") {
    console.log(
      `[${config.SYMBOL}] STOP LOSS! ` +
        `current=${action.currentPrice} ` +
        `entry=${action.buyEntryPrice} ` +
        `stop=${action.stopLossPrice}`,
    );

    // Закрываем SELL на 100% и собираем комиссии.
    await closeLimitPosition({
      connection: pub_wallet_connection,
      poolAddress: config.POOL_ADDRESS,
      user,
      positionAddress: action.positionAddress,
    });

    // Продаём весь остаток токена в SOL.
    await swapAllTokenToSol(
      pub_wallet_connection,
      user,
      config.TOKEN_MINT,
      100,
    );

    // Очищаем состояние только после успешного выхода.
    removePosition(action.positionAddress);

    console.log(`[${config.SYMBOL}] STOP LOSS завершён.`);
  }
}
