import DLMM from "@meteora-ag/dlmm";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import BN from "bn.js";

export async function closeLimitPosition(params: {
  connection: Connection;
  poolAddress: string;
  user: Keypair;
  positionAddress: string;
}): Promise<void> {
  const { connection, poolAddress, user, positionAddress } = params;

  const pool = await DLMM.create(
    connection,
    new PublicKey(poolAddress),
    { cluster: "mainnet-beta" },
  );

  const positionPubKey = new PublicKey(positionAddress);

  const { userPositions } =
    await pool.getPositionsByUserAndLbPair(user.publicKey);

  const position = userPositions.find((p) =>
    p.publicKey.equals(positionPubKey),
  );

  // Повторный вызов после успешного закрытия безопасен.
  if (!position) {
    console.log(`[DLMM] Позиция уже закрыта: ${positionAddress}`);
    return;
  }

  const data = position.positionData;
  const bins = data.positionBinData ?? [];

  const binIds = bins
    .map((bin) => Number(bin.binId))
    .filter(Number.isFinite);

  const lowerBinId = Number(data.lowerBinId);
  const upperBinId = Number(data.upperBinId);

  const fromBinId =
    binIds.length > 0
      ? Math.min(...binIds)
      : lowerBinId;

  const toBinId =
    binIds.length > 0
      ? Math.max(...binIds)
      : upperBinId;

  if (
    !Number.isFinite(fromBinId) ||
    !Number.isFinite(toBinId) ||
    fromBinId > toBinId
  ) {
    throw new Error(
      `Не удалось определить диапазон bin для позиции ${positionAddress}`,
    );
  }

  const transactions = await pool.removeLiquidity({
    position: positionPubKey,
    user: user.publicKey,
    fromBinId,
    toBinId,
    bps: new BN(10_000),
    shouldClaimAndClose: true,
  });

  for (const [index, tx] of transactions.entries()) {
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [user],
      {
        skipPreflight: false,
        commitment: "confirmed",
      },
    );

    console.log(
      `[DLMM] Закрытие ${index + 1}/${transactions.length}: ${signature}`,
    );
  }

  const { userPositions: remainingPositions } =
    await pool.getPositionsByUserAndLbPair(user.publicKey);

  const stillExists = remainingPositions.some((p) =>
    p.publicKey.equals(positionPubKey),
  );

  if (stillExists) {
    throw new Error(
      `Позиция ${positionAddress} всё ещё существует после закрытия`,
    );
  }

  console.log(`[DLMM] Позиция полностью закрыта: ${positionAddress}`);
}