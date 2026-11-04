import DLMM, { StrategyType } from "@meteora-ag/dlmm";
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import BN from "bn.js";

export interface OpenLimitPositionParams {
  connection: Connection;
  poolAddress: string;          // config.POOL_ADDRESS
  user: Keypair;                // кошелёк-подписант
  tokenMint: string;            // config.TOKEN_MINT (base mint)
  side: "buy" | "sell";
  targetPrice: number;          // человеческая цена (например, 0.00298)
  amountRaw: BN;                // сумма в raw units (lamports для USDC, raw для токена)
  binRangeWidth?: number;       // сколько бинов шириной (по умолчанию 1 — чистый лимит)
}

/**
 * Открывает одностороннюю лимитную позицию в пуле Meteora DLMM.
 *
 * BUY  — размещает USDC (quote) в бинах НИЖЕ активного → сработает при падении цены.
 * SELL — размещает токен (base) в бинах ВЫШЕ активного → сработает при росте цены.
 *
 * Возвращает подпись транзакции.
 */
export async function openLimitPosition(
  params: OpenLimitPositionParams,
): Promise<string> {
  const {
    connection,
    poolAddress,
    user,
    tokenMint,
    side,
    targetPrice,
    amountRaw,
    binRangeWidth = 1,
  } = params;

  // 1. Инициализируем пул
  const pool = await DLMM.create(connection, new PublicKey(poolAddress), {
    cluster: "mainnet-beta",
  });

  const activeBin = await pool.getActiveBin();
  const binStep = pool.lbPair.binStep;

  // 2. Преобразуем целевую цену в bin ID.
  //    getBinIdFromPrice(price, binStep, min) — min=true округляет вниз.
  //    Для BUY округляем вниз (более низкая цена), для SELL — вверх.
  const targetBinId = DLMM.getBinIdFromPrice(
    targetPrice,
    binStep,
    side === "buy", // true → floor для BUY, false → ceil для SELL
  );

  // 3. Проверяем, что бин с правильной стороны от активного
  if (side === "buy" && targetBinId >= activeBin.binId) {
    throw new Error(
      `BUY bin ${targetBinId} >= active bin ${activeBin.binId}; цена ${targetPrice} не ниже текущей`,
    );
  }
  if (side === "sell" && targetBinId <= activeBin.binId) {
    throw new Error(
      `SELL bin ${targetBinId} <= active bin ${activeBin.binId}; цена ${targetPrice} не выше текущей`,
    );
  }

  // 4. Диапазон бинов вокруг целевого (по умолчанию 1 бин — чистый лимит)
  const half = Math.max(0, Math.floor((binRangeWidth - 1) / 2));
  const minBinId = targetBinId - half;
  const maxBinId = targetBinId + half;

  // 5. Определяем, какой токен в пуле является X (base), а какой Y (quote)
  const tokenXMint = pool.lbPair.tokenXMint.toBase58();
  // const tokenYMint = pool.lbPair.tokenYMint.toBase58(); // обычно USDC
  const isBaseX = tokenXMint === tokenMint;

  // 6. Собираем параметры односторонней позиции
  //    BUY:  депонируем quote (USDC) → если USDC это Y, то singleSidedX = false
  //    SELL: депонируем base (токен) → если токен это X, то singleSidedX = true
  let totalXAmount: BN;
  let totalYAmount: BN;
  let singleSidedX: boolean;

  if (side === "sell") {
    // Продаём base-токен → кладём только X (если base = X) или только Y (если base = Y)
    if (isBaseX) {
      totalXAmount = amountRaw;
      totalYAmount = new BN(0);
      singleSidedX = true;
    } else {
      totalXAmount = new BN(0);
      totalYAmount = amountRaw;
      singleSidedX = false;
    }
  } else {
    // Покупаем base за quote → кладём только quote (USDC)
    if (isBaseX) {
      // base = X, значит quote = Y (USDC)
      totalXAmount = new BN(0);
      totalYAmount = amountRaw;
      singleSidedX = false;
    } else {
      // base = Y, значит quote = X (USDC)
      totalXAmount = amountRaw;
      totalYAmount = new BN(0);
      singleSidedX = true;
    }
  }

  // 7. Создаём keypair под новую позицию (SDK инициализирует её в той же транзакции)
  const positionKeypair = Keypair.generate();

  const tx = await pool.initializePositionAndAddLiquidityByStrategy({
    positionPubKey: positionKeypair.publicKey,
    user: user.publicKey,
    totalXAmount,
    totalYAmount,
    strategy: {
      minBinId,
      maxBinId,
      strategyType: StrategyType.Spot, // для лимита достаточно Spot
      singleSidedX,
    },
  });

  const signature = await sendAndConfirmTransaction(connection, tx, [
    user,
    positionKeypair,
  ]);

  console.log(
    `   ✅ limit ${side.toUpperCase()} bin=[${minBinId}..${maxBinId}] ` +
    `price≈${targetPrice.toFixed(8)}  sig=${signature}`,
  );

  return signature;
}