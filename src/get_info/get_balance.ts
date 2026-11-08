
import { PublicKey } from "@solana/web3.js";
import { pub_wallet_connection } from "../client/pub_wallet_connect";

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);

const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
);

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WSOL_MINT = "So11111111111111111111111111111111111111112";

export interface TokenBalances {
  sol: number;
  wsol: number;
  usdc: number;
  token: number;
  solLamports: number;
}

export async function getAssetBalances(
  walletAddress: string,
  tokenMintAddress: string,
): Promise<TokenBalances> {
  try {
    const walletPubKey = new PublicKey(walletAddress);

    // Получаем SOL и аккаунты обеих программ токенов
    const [
      solLamports,
      splAccounts,
      token2022Accounts,
    ] = await Promise.all([
      pub_wallet_connection.getBalance(walletPubKey),

      pub_wallet_connection.getParsedTokenAccountsByOwner(walletPubKey, {
        programId: TOKEN_PROGRAM_ID,
      }),

      pub_wallet_connection.getParsedTokenAccountsByOwner(walletPubKey, {
        programId: TOKEN_2022_PROGRAM_ID,
      }),
    ]);

    const sol = solLamports / 1e9;

    let usdcBalance = 0;
    let tokenBalance = 0;
    let wsolBalance = 0;

    // Объединяем аккаунты обеих программ
    const allAccounts = [
      ...splAccounts.value,
      ...token2022Accounts.value,
    ];

    let tokenAccountCount = 0;

    for (const account of allAccounts) {
      const info = account.account.data.parsed.info;

      const mint = info.mint;
      const tokenAmount = info.tokenAmount;

      // Берём точное значение из raw amount
      const rawAmount = Number(tokenAmount.amount);
      const decimals = tokenAmount.decimals;

      if (!Number.isFinite(rawAmount)) continue;

      const uiAmount = rawAmount / Math.pow(10, decimals);

      if (mint === tokenMintAddress) {
        tokenBalance += uiAmount;
        tokenAccountCount++;

        console.log(
          `[BALANCE] Найден аккаунт токена: ${account.pubkey.toBase58()} | ` +
          `balance=${uiAmount} | decimals=${decimals}`,
        );
      } else if (mint === WSOL_MINT) {
        wsolBalance += uiAmount;
      } else if (mint === USDC_MINT) {
        usdcBalance += uiAmount;
      }
    }

    console.log(
      `[BALANCE] SPL accounts: ${splAccounts.value.length} | ` +
      `Token-2022 accounts: ${token2022Accounts.value.length}`,
    );

    console.log(
      `[BALANCE] HELL mint: ${tokenMintAddress} | ` +
      `accounts: ${tokenAccountCount} | balance: ${tokenBalance}`,
    );

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
