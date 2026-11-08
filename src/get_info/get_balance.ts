
import { PublicKey } from "@solana/web3.js";
import { pub_wallet_connection } from "../client/pub_wallet_connect";

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);

const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
);

const USDC_MINT =
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const WSOL_MINT =
  "So11111111111111111111111111111111111111112";

export interface TokenBalances {
  sol: number;
  wsol: number;
  usdc: number;
  token: number;
  solLamports: number;
}

function rawToUi(rawAmount: string, decimals: number): number {
  return Number(BigInt(rawAmount)) / 10 ** decimals;
}

export async function getAssetBalances(
  walletAddress: string,
  tokenMintAddress: string,
  tokenSymbol = "TOKEN",
): Promise<TokenBalances> {
  const walletPubKey = new PublicKey(walletAddress);
  const tokenMint = new PublicKey(tokenMintAddress);

  const [
    solLamports,
    splAccounts,
    token2022Accounts,
  ] = await Promise.all([
    pub_wallet_connection.getBalance(walletPubKey),

    pub_wallet_connection.getParsedTokenAccountsByOwner(
      walletPubKey,
      { programId: TOKEN_PROGRAM_ID },
    ),

    pub_wallet_connection.getParsedTokenAccountsByOwner(
      walletPubKey,
      { programId: TOKEN_2022_PROGRAM_ID },
    ),
  ]);

  const sol = solLamports / 1_000_000_000;

  let usdcBalance = 0;
  let tokenBalance = 0;
  let wsolBalance = 0;

  const allAccounts = [
    ...splAccounts.value,
    ...token2022Accounts.value,
  ];

  let tokenAccountCount = 0;

  for (const account of allAccounts) {
    const info = account.account.data.parsed.info;

    const mint = new PublicKey(info.mint);

    const amount = info.tokenAmount.amount as string;
    const decimals = Number(info.tokenAmount.decimals);

    if (!Number.isInteger(decimals) || decimals < 0) {
      throw new Error(
        `Некорректные decimals в аккаунте ${account.pubkey.toBase58()}`,
      );
    }

    const uiAmount = rawToUi(amount, decimals);

    if (mint.equals(tokenMint)) {
      tokenBalance += uiAmount;
      tokenAccountCount++;

      console.log(
        `[BALANCE] ${tokenSymbol}: ${account.pubkey.toBase58()} | ` +
        `balance=${uiAmount} | decimals=${decimals}`,
      );
    } else if (mint.toBase58() === WSOL_MINT) {
      wsolBalance += uiAmount;
    } else if (mint.toBase58() === USDC_MINT) {
      usdcBalance += uiAmount;
    }
  }

  console.log(
    `[BALANCE] SPL accounts: ${splAccounts.value.length} | ` +
    `Token-2022 accounts: ${token2022Accounts.value.length}`,
  );

  console.log(
    `[BALANCE] ${tokenSymbol} mint: ${tokenMintAddress} | ` +
    `accounts: ${tokenAccountCount} | balance: ${tokenBalance}`,
  );

  return {
    sol,
    wsol: wsolBalance,
    usdc: usdcBalance,
    token: tokenBalance,
    solLamports,
  };
}
