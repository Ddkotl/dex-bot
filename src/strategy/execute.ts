import BN from "bn.js";

import { openLimitPosition } from "../actions/openLimitPosition";
import { closeLimitPosition } from "../actions/closeLimitPosition";

import { getAssetBalances } from "../get_info/get_balance";
import {
  savePositionSide,
  removePositionSide,
} from "../get_info/position_state_store";

import type { DexCoinConfig } from "../config";
import type { Action } from "./decide";

import { loadWalletKeypair } from "../utits/keypair";
import { pub_wallet_connection } from "../client/pub_wallet_connect";

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

  const openBuy = async (price: number, quoteAmount: number) => {
    const amountRaw = toRaw(
      quoteAmount,
      config.QUOTE_DECIMALS_MULTIPLIER,
    );

    console.log(
      `[${config.SYMBOL}] OPEN_BUY price=${price} quote=${quoteAmount} raw=${amountRaw.toString()}`,
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

    savePositionSide(result.positionAddress, "BUY");
  };

  const openSell = async (price: number, tokens: number) => {
    const tokenMultiplier = 10 ** config.TOKEN_DECIMALS;
    const amountRaw = toRaw(tokens, tokenMultiplier);

    console.log(
      `[${config.SYMBOL}] OPEN_SELL price=${price} tokens=${tokens} raw=${amountRaw.toString()}`,
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

    savePositionSide(result.positionAddress, "SELL");
  };

  if (action.type === "OPEN_BUY") {
    await openBuy(action.price, action.quoteAmount);
    return;
  }

  if (action.type === "OPEN_SELL") {
    await openSell(action.price, action.tokens);
    return;
  }

  if (action.type === "SWITCH_TO_BUY") {
    console.log(
      `[${config.SYMBOL}] SWITCH BUY: закрываем ${action.positionAddress}`,
    );

    await closeLimitPosition({
      connection: pub_wallet_connection,
      poolAddress: config.POOL_ADDRESS,
      user,
      positionAddress: action.positionAddress,
    });

    // Удаляем старую запись только после подтверждённого закрытия.
    removePositionSide(action.positionAddress);

    const balance = await getAssetBalances(
      user.publicKey.toBase58(),
      config.TOKEN_MINT,
      config.SYMBOL,
    );

    const quoteBalance = balance.sol + balance.wsol;

    if (quoteBalance < config.MIN_NOTIONAL) {
      console.log(
        `[${config.SYMBOL}] SWITCH BUY отменён: quote balance=${quoteBalance}`,
      );
      return;
    }

    const amount = Math.min(
      config.QUOTE_QUANTITY,
      quoteBalance,
    );

    await openBuy(action.price, amount);
    return;
  }

  if (action.type === "SWITCH_TO_SELL") {
    console.log(
      `[${config.SYMBOL}] SWITCH SELL: закрываем ${action.positionAddress}`,
    );

    await closeLimitPosition({
      connection: pub_wallet_connection,
      poolAddress: config.POOL_ADDRESS,
      user,
      positionAddress: action.positionAddress,
    });

    removePositionSide(action.positionAddress);

    const balance = await getAssetBalances(
      user.publicKey.toBase58(),
      config.TOKEN_MINT,
      config.SYMBOL,
    );

    const tokens = balance.token;
    const tokenValue = tokens * action.currentPrice;

    if (tokenValue < config.MIN_NOTIONAL) {
      console.log(
        `[${config.SYMBOL}] SWITCH SELL отменён: token value=${tokenValue}`,
      );
      return;
    }

    await openSell(action.price, tokens);
  }
}