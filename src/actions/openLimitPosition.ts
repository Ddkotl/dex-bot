import DLMM, { StrategyType } from "@meteora-ag/dlmm";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import BN from "bn.js";

export interface OpenLimitPositionParams {
  connection: Connection;
  poolAddress: string;
  user: Keypair;
  tokenMint: string;
  side: "buy" | "sell";
  targetPrice: number;
  amountRaw: BN;
  binRangeWidth?: number;
}

/**
 * Конвертирует bin ID в индекс bin array (корзины).
 * Повторяет логику binIdToBinArrayIndex из SDK Meteora:
 *  - для binId >= 0: floor(binId / 70)
 *  - для binId < 0:  floor((binId - 69) / 70)
 *    (bin -1..-70 → array -1; bin -71..-140 → array -2 и т.д.)
 */
function binIdToBinArrayIndex(binId: number): number {
  if (binId >= 0) {
    return Math.floor(binId / 70);
  }
  return Math.floor((binId - 69) / 70);
}

export async function openLimitPosition(
  params: OpenLimitPositionParams,
): Promise<{
  signature: string;
  positionAddress: string;
  binId: number;
}> {
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

  const pool = await DLMM.create(connection, new PublicKey(poolAddress), {
    cluster: "mainnet-beta",
  });

  const activeBin = await pool.getActiveBin();
  const binStep = pool.lbPair.binStep;

  // Определяем, какой из токенов пула является базовым.
  const tokenXMint = pool.lbPair.tokenXMint.toBase58();
  const isBaseX = tokenXMint === tokenMint;

  // DLMM использует цену Y/X.
  // Если базовый токен X — цена уже в нужной ориентации.
  // Если базовый токен Y — переворачиваем цену.
  const poolPrice = isBaseX ? targetPrice : 1 / targetPrice;

  let targetBinId = DLMM.getBinIdFromPrice(
    poolPrice,
    binStep,
    side === "buy",
  );

  // Определяем требуемую сторону относительно активного bin.
  const mustBeBelow =
    (side === "buy" && isBaseX) ||
    (side === "sell" && !isBaseX);

  const originalTargetBinId = targetBinId;

  // Если целевой bin оказался не на той стороне,
  // перемещаем его на ближайший допустимый bin.
  if (mustBeBelow && targetBinId >= activeBin.binId) {
    targetBinId = activeBin.binId - 1;
  }

  if (!mustBeBelow && targetBinId <= activeBin.binId) {
    targetBinId = activeBin.binId + 1;
  }

  console.log(
    `   📍 Active bin: ${activeBin.binId}`,
  );

  console.log(
    `   🎯 Calculated bin: ${originalTargetBinId}`,
  );

  console.log(
    `   🎯 Selected bin: ${targetBinId}`,
  );

  if (targetBinId !== originalTargetBinId) {
    console.log(
      `   ⚠️ Target bin adjusted to nearest valid bin`,
    );
  }

  // Только один bin на позицию.
  const minBinId = targetBinId;
  const maxBinId = targetBinId;

  // Финальная проверка стороны.
  if (mustBeBelow && targetBinId >= activeBin.binId) {
    throw new Error(
      `BUY bin ${targetBinId} должен быть ниже active bin ${activeBin.binId}`,
    );
  }

  if (!mustBeBelow && targetBinId <= activeBin.binId) {
    throw new Error(
      `SELL bin ${targetBinId} должен быть выше active bin ${activeBin.binId}`,
    );
  }

  // ── 2. Проверка существования Bin Arrays ──────────────────
  console.log(
    `   🔍 Проверка корзин для диапазона [${minBinId}..${maxBinId}]...`,
  );

  const existingBinArrays = await pool.getBinArrays();
  // ✅ Правильное поле: ba.account.index (BN), а не binArrayIndex
  const existingIndexes = new Set<number>(
    existingBinArrays.map((ba) => ba.account.index.toNumber()),
  );

  const requiredIndexes = new Set<number>();
  for (let binId = minBinId; binId <= maxBinId; binId++) {
    requiredIndexes.add(binIdToBinArrayIndex(binId));
  }

  const missingIndexes: number[] = [];
  for (const idx of requiredIndexes) {
    if (!existingIndexes.has(idx)) {
      missingIndexes.push(idx);
    }
  }

  if (missingIndexes.length > 0) {
    const rentCost = missingIndexes.length * 0.075;
    throw new Error(
      `❌ Отмена: для диапазона [${minBinId}..${maxBinId}] ` +
        `не хватает ${missingIndexes.length} корзин ` +
        `(индексы: ${missingIndexes.join(", ")}). ` +
        `Создание новых корзин стоит ~${rentCost.toFixed(2)} SOL безвозвратно. ` +
        `Сделка пропущена для экономии средств.`,
    );
  }

  console.log(
    `   ✅ Все необходимые корзины (${requiredIndexes.size}) уже существуют. Рент не потребуется.`,
  );

  // ── 3. Определяем стороны X и Y ────────────────────────────

  let totalXAmount: BN;
  let totalYAmount: BN;
  let singleSidedX: boolean;

  if (side === "sell") {
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
    if (isBaseX) {
      totalXAmount = new BN(0);
      totalYAmount = amountRaw;
      singleSidedX = false;
    } else {
      totalXAmount = amountRaw;
      totalYAmount = new BN(0);
      singleSidedX = true;
    }
  }

  // ── 4. Открываем позицию ───────────────────────────────────
  const positionKeypair = Keypair.generate();

  const tx = await pool.initializePositionAndAddLiquidityByStrategy({
    positionPubKey: positionKeypair.publicKey,
    user: user.publicKey,
    totalXAmount,
    totalYAmount,
    strategy: {
      minBinId,
      maxBinId,
      strategyType: StrategyType.Spot,
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

  return {
    signature,
    positionAddress: positionKeypair.publicKey.toBase58(),
    binId: targetBinId,
  };
}
