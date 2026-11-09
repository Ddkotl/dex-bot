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
  binPrice: number;
}> {
  const {
    connection,
    poolAddress,
    user,
    tokenMint,
    side,
    targetPrice,
    amountRaw,
  } = params;

  if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
    throw new Error(`Некорректная targetPrice: ${targetPrice}`);
  }

  if (amountRaw.lte(new BN(0))) {
    throw new Error("amountRaw должен быть больше нуля");
  }

  const pool = await DLMM.create(connection, new PublicKey(poolAddress), {
    cluster: "mainnet-beta",
  });

  const activeBin = await pool.getActiveBin();

  const tokenXMint = pool.lbPair.tokenXMint.toBase58();
  const isBaseX = tokenXMint === tokenMint;

  // Цена пула всегда Y/X.
  const poolPrice = isBaseX ? targetPrice : 1 / targetPrice;

  const originalTargetBinId = DLMM.getBinIdFromPrice(
    poolPrice,
    pool.lbPair.binStep,
    side === "buy",
  );

  let targetBinId = originalTargetBinId;

  const mustBeBelow =
    (side === "buy" && isBaseX) || (side === "sell" && !isBaseX);

  if (mustBeBelow && targetBinId >= activeBin.binId) {
    targetBinId = activeBin.binId - 1;
  }

  if (!mustBeBelow && targetBinId <= activeBin.binId) {
    targetBinId = activeBin.binId + 1;
  }

  console.log(`[DLMM] Active bin: ${activeBin.binId}`);
  console.log(`[DLMM] Calculated bin: ${originalTargetBinId}`);
  console.log(`[DLMM] Selected bin: ${targetBinId}`);

  const minBinId = targetBinId;
  const maxBinId = targetBinId;

  if (mustBeBelow && targetBinId >= activeBin.binId) {
    throw new Error("BUY bin должен находиться ниже active bin");
  }

  if (!mustBeBelow && targetBinId <= activeBin.binId) {
    throw new Error("SELL bin должен находиться выше active bin");
  }

  // Проверяем наличие Bin Arrays.
  const existingBinArrays = await pool.getBinArrays();

  const existingIndexes = new Set<number>(
    existingBinArrays.map((ba) => ba.account.index.toNumber()),
  );

  const requiredIndexes = new Set<number>();

  for (let binId = minBinId; binId <= maxBinId; binId++) {
    requiredIndexes.add(binIdToBinArrayIndex(binId));
  }

  const missingIndexes = [...requiredIndexes].filter(
    (idx) => !existingIndexes.has(idx),
  );

  if (missingIndexes.length > 0) {
    throw new Error(
      `Не хватает Bin Arrays: ${missingIndexes.join(", ")}. ` +
        "Открытие позиции отменено.",
    );
  }

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

  // Получаем цену именно выбранного bin.
  const binPrice = targetPrice;

  if (!Number.isFinite(binPrice) || binPrice <= 0) {
    throw new Error(`Не удалось вычислить цену bin ${targetBinId}`);
  }

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

  const transactions = Array.isArray(tx) ? tx : [tx];

  let signature = "";

  for (const transaction of transactions) {
    signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [user, positionKeypair],
      {
        skipPreflight: false,
        commitment: "confirmed",
      },
    );
  }

  console.log(
    `[DLMM] ${side.toUpperCase()} открыт | ` +
      `bin=${targetBinId} | price=${binPrice} | sig=${signature}`,
  );

  return {
    signature,
    positionAddress: positionKeypair.publicKey.toBase58(),
    binId: targetBinId,
    binPrice,
  };
}
