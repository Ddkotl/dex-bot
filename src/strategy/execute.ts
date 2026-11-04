// src/exchange/meteora/execute.ts

import BN from "bn.js";
import { openLimitPosition } from "../actions/openLimitPosition";
import type { DexCoinConfig } from "../config";
import type { Action } from "./decide";
import { loadWalletKeypair } from "../utits/keypair";
import { pub_wallet_connection } from "../client/pub_wallet_connect";

/** USDC на Solana — 6 decimals (минт EPjFW…TDt1v) */
const USDC_MULTIPLIER = 1_000_000;

export async function executeAction(
  action: Action,
  config: DexCoinConfig,
  _market?: { currentPrice: number }, // не используется, оставлен для совместимости с tradeLoop
): Promise<void> {
  if (action.type === "NOOP") return;

  // Приватный ключ читаем один раз на действие — как и в rent:cleanup
  const user = loadWalletKeypair();

  if (action.type === "OPEN_BUY") {
    // BUY платим USDC → raw = usdc * 10^6
    const amountRaw = new BN(Math.floor(action.usdc * USDC_MULTIPLIER));

    console.log(
      `[${config.SYMBOL}] 🟢 OPEN_BUY  price=${action.price.toFixed(8)}  usdc=${action.usdc}  raw=${amountRaw.toString()}`,
    );

    await openLimitPosition({
      connection: pub_wallet_connection,
      poolAddress: config.POOL_ADDRESS,
      user,
      tokenMint: config.TOKEN_MINT,
      side: "buy",
      targetPrice: action.price,
      amountRaw,
    });
  }

  if (action.type === "OPEN_SELL") {
    // SELL отдаём base-токен → raw = tokens * DECEMIALS (DECEMIALS = 10^decimals)
    const amountRaw = new BN(Math.floor(action.tokens * config.DECEMIALS));

    console.log(
      `[${config.SYMBOL}] 🔴 OPEN_SELL price=${action.price.toFixed(8)}  tokens=${action.tokens}  raw=${amountRaw.toString()}`,
    );

    await openLimitPosition({
      connection: pub_wallet_connection,
      poolAddress: config.POOL_ADDRESS,
      user,
      tokenMint: config.TOKEN_MINT,
      side: "sell",
      targetPrice: action.price,
      amountRaw,
    });
  }
}