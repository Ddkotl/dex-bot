import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import "dotenv/config";
import { pub_wallet_connection } from "../client/pub_wallet_connect";

/**
 * Выводит в консоль информацию о залогах (rent) для всех SPL-токен-аккаунтов
 * кошелька, указанного в .env (WALLET_PUB_ADRESS).
 */
export async function logRentDeposits(): Promise<void> {
  const walletAddress = process.env.WALLET_PUB_ADRESS;
  if (!walletAddress) {
    throw new Error("WALLET_PUB_ADRESS не задан в .env");
  }

  const owner = new PublicKey(walletAddress);
  console.log(`🔍 Кошелёк: ${walletAddress}`);

  const tokenAccounts =
    await pub_wallet_connection.getParsedTokenAccountsByOwner(owner, {
      programId: TOKEN_PROGRAM_ID,
    });

  if (tokenAccounts.value.length === 0) {
    console.log("📭 У кошелька нет SPL-токен-аккаунтов.");
    return;
  }

  console.log(`📊 Найдено аккаунтов: ${tokenAccounts.value.length}\n`);

  let totalLamports = 0;

  for (const info of tokenAccounts.value) {
    const parsed = info.account.data.parsed.info;
    const lamports = info.account.lamports;
    totalLamports += lamports;

    console.log(`📌 Аккаунт: ${info.pubkey.toBase58()}`);
    console.log(`   Mint:       ${parsed.mint}`);
    console.log(`   Баланс:     ${parsed.tokenAmount.uiAmount}`);
    console.log(
      `   Залог:      ${lamports} lamports (${(lamports / 1e9).toFixed(9)} SOL)`,
    );
    console.log("   ─────────────────────────────────────");
  }

  console.log(
    `\n💰 Общий залог: ${totalLamports} lamports (${(totalLamports / 1e9).toFixed(9)} SOL)`,
  );
}