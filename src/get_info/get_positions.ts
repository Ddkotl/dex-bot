
import DLMM from "@meteora-ag/dlmm";
import { PublicKey } from "@solana/web3.js";
import { pub_wallet_connection } from "../client/pub_wallet_connect";

export interface Dlmmpresentation {
  positionAddress: string;

  totalTokens: number;
  totalQuote: number;

  feeTokens: number;
  feeQuote: number;

  isBuyOrder: boolean;
  isSellOrder: boolean;

  binCount: number;
  firstBinId: number | null;
  lastBinId: number | null;
}

export async function getActiveLimitPositions(
  poolAddress: string,
  walletAddress: string,
  TOKEN_DECIMALS_MULTIPLIER: number,
): Promise<Dlmmpresentation[]> {
  try {
    const poolPubKey = new PublicKey(poolAddress.trim());
    const userPubKey = new PublicKey(walletAddress.trim());

    const dlmmPool = await DLMM.create(
      pub_wallet_connection,
      poolPubKey,
    );

    const { userPositions } =
      await dlmmPool.getPositionsByUserAndLbPair(userPubKey);

    const activeBin = await dlmmPool.getActiveBin();
    const currentBinId = activeBin.binId;

    const parsedPositions: Dlmmpresentation[] = [];

    for (const pos of userPositions) {
      const positionData = pos.positionData;

      const totalX = Number(positionData.totalXAmount);
      const totalY = Number(positionData.totalYAmount);

      const feeX = Number(positionData.feeX);
      const feeY = Number(positionData.feeY);

      const bins = positionData.positionBinData || [];

      const binIds = bins
        .map((bin) => bin.binId)
        .filter((id): id is number => Number.isFinite(id));

      const firstBinId =
        binIds.length > 0 ? Math.min(...binIds) : null;

      const lastBinId =
        binIds.length > 0 ? Math.max(...binIds) : null;

      // Направление по расположению диапазона относительно active bin.
      const isBuyOrder =
        firstBinId !== null && lastBinId !== null
          ? lastBinId < currentBinId
          : false;

      const isSellOrder =
        firstBinId !== null && lastBinId !== null
          ? firstBinId > currentBinId
          : false;

      parsedPositions.push({
        positionAddress: pos.publicKey.toBase58(),

        totalTokens: totalX / TOKEN_DECIMALS_MULTIPLIER,
        totalQuote: totalY / 1_000_000_000,

        feeTokens: feeX / TOKEN_DECIMALS_MULTIPLIER,
        feeQuote: feeY / 1_000_000_000,

        isBuyOrder,
        isSellOrder,

        binCount: bins.length,
        firstBinId,
        lastBinId,
      });
    }

    return parsedPositions;
  } catch (error) {
    console.error(
      "Ошибка при получении лимитных позиций с блокчейна:",
      error,
    );

    return [];
  }
}
