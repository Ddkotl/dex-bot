import { PublicKey } from "@solana/web3.js";
import { pub_wallet_connection } from "../client/pub_wallet_connect";

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WSOL_MINT = "So11111111111111111111111111111111111111112";

export interface TokenBalances {
  /** Нативный SOL в UI-единицах (lamports / 1e9) — газ, rent */
  sol: number;
  /** Wrapped SOL с токен-аккаунта (обычно 0, если не обёрнут) */
  wsol: number;
  /** USDC (для USDC-пулов на будущее) */
  usdc: number;
  /** Баланс торгуемого токена */
  token: number;
  /** Сырые lamports для точных расчётов газа/rent */
  solLamports: number;
}

/**
 * Один параллельный запрос к RPC: все SPL-токены + нативный SOL.
 * Никаких лишних вызовов — getBalance и getParsedTokenAccountsByOwner
 * идут одновременно через Promise.all.
 */
export async function getAssetBalances(
  walletAddress: string,
  tokenMintAddress: string,
): Promise<TokenBalances> {
  try {
    const walletPubKey = new PublicKey(walletAddress);

    const [solLamports, tokenAccountsResponse] = await Promise.all([
      // Нативный SOL — 1 лёгкий вызов
      pub_wallet_connection.getBalance(walletPubKey),
      // Все SPL-токены кошелька — 1 вызов
      pub_wallet_connection.getParsedTokenAccountsByOwner(walletPubKey, {
        programId: TOKEN_PROGRAM_ID,
      }),
    ]);

    const sol = solLamports / 1e9;

    let usdcBalance = 0;
    let tokenBalance = 0;
    let wsolBalance = 0;

    if (tokenAccountsResponse?.value) {
      for (const accountInfo of tokenAccountsResponse.value) {
        const parsedInfo = accountInfo.account.data.parsed.info;
        const mint = parsedInfo.mint;
        const uiAmount = Number(parsedInfo.tokenAmount.uiAmount || 0);

        if (mint === USDC_MINT) {
          usdcBalance = uiAmount;
        } else if (mint === tokenMintAddress) {
          tokenBalance = uiAmount;
        } else if (mint === WSOL_MINT) {
          wsolBalance = uiAmount;
        }
      }
    }

    return {
      sol,
      wsol: wsolBalance,
      usdc: usdcBalance,
      token: tokenBalance,
      solLamports,
    };
  } catch (error) {
    console.error(
      "Критическая ошибка при запросе балансов с RPC:",
      error,
    );
    throw error;
  }
}