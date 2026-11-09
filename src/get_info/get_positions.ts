import DLMM from "@meteora-ag/dlmm";
import { PublicKey } from "@solana/web3.js";
import { pub_wallet_connection } from "../client/pub_wallet_connect";
import { getStoredPositionSide } from "./position_state_store";
export type PositionState = "QUOTE_ONLY" | "TOKEN_ONLY" | "MIXED" | "EMPTY";

export type PositionSide = "BUY" | "SELL" | "UNKNOWN";

export interface Dlmmpresentation {
  positionAddress: string;
  totalTokens: number;
  totalQuote: number;
  feeTokens: number;
  feeQuote: number;
  state: PositionState;
  side: PositionSide;
  binCount: number;
  firstBinId: number | null;
  lastBinId: number | null;
  activeBinId: number;
}

function rawToUi(value: unknown, decimals: number): number {
  return Number(BigInt(String(value ?? "0"))) / 10 ** decimals;
}

export async function getActiveLimitPositions(
  poolAddress: string,
  walletAddress: string,
  tokenMint: string,
  tokenDecimals: number,
  quoteDecimals = 9,
): Promise<Dlmmpresentation[]> {
  const pool = await DLMM.create(
    pub_wallet_connection,
    new PublicKey(poolAddress.trim()),
    { cluster: "mainnet-beta" },
  );

  const userPubKey = new PublicKey(walletAddress.trim());
  const tokenPubKey = new PublicKey(tokenMint.trim());

  const isBaseX = pool.lbPair.tokenXMint.equals(tokenPubKey);
  const isBaseY = pool.lbPair.tokenYMint.equals(tokenPubKey);

  if (!isBaseX && !isBaseY) {
    throw new Error("TOKEN_MINT не найден в tokenXMint/tokenYMint пула");
  }

  const { userPositions, activeBin } =
    await pool.getPositionsByUserAndLbPair(userPubKey);

  const activeBinId = Number(activeBin.binId);
  const result: Dlmmpresentation[] = [];

  const tokenTolerance = 2 / 10 ** tokenDecimals;
  const quoteTolerance = 2 / 10 ** quoteDecimals;

  for (const position of userPositions) {
    const data = position.positionData;

    const totalX = rawToUi(data.totalXAmount, pool.tokenX.mint.decimals);

    const totalY = rawToUi(data.totalYAmount, pool.tokenY.mint.decimals);

    const feeX = rawToUi(data.feeX, pool.tokenX.mint.decimals);

    const feeY = rawToUi(data.feeY, pool.tokenY.mint.decimals);

    const totalTokens = isBaseX ? totalX : totalY;
    const totalQuote = isBaseX ? totalY : totalX;
    const feeTokens = isBaseX ? feeX : feeY;
    const feeQuote = isBaseX ? feeY : feeX;

    const bins = data.positionBinData ?? [];

    const binIds = bins.map((bin) => Number(bin.binId)).filter(Number.isFinite);

    const firstBinId = binIds.length > 0 ? Math.min(...binIds) : null;

    const lastBinId = binIds.length > 0 ? Math.max(...binIds) : null;

    const storedSide = getStoredPositionSide(position.publicKey.toBase58());

    if (!storedSide) {
      throw new Error(
        `Не найден side для позиции ${position.publicKey.toBase58()}`,
      );
    }

    const side: PositionSide = storedSide;

    let state: PositionState;

    if (totalTokens <= tokenTolerance && totalQuote <= quoteTolerance) {
      state = "EMPTY";
    } else if (totalTokens <= tokenTolerance) {
      state = "QUOTE_ONLY";
    } else if (totalQuote <= quoteTolerance) {
      state = "TOKEN_ONLY";
    } else {
      state = "MIXED";
    }

    result.push({
      positionAddress: position.publicKey.toBase58(),
      totalTokens,
      totalQuote,
      feeTokens,
      feeQuote,
      state,
      side,
      binCount: bins.length,
      firstBinId,
      lastBinId,
      activeBinId,
    });
  }

  return result;
}
