import {
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createCloseAccountInstruction,
} from "@solana/spl-token";
import "dotenv/config";
import { COINS_CONFIG, QUOTE_TOKEN } from "../config";
import { pub_wallet_connection } from "../client/pub_wallet_connect";
import { loadWalletKeypair } from "../utits/keypair";

/**
 * Закрывает SPL-токен-аккаунты, чьи mint отсутствуют в COINS_CONFIG
 * (а также не совпадают с QUOTE_TOKEN.MINT), возвращая залог на кошелёк.
 * Закрываются только аккаунты с нулевым балансом токенов.
 * Установите DRY_RUN=true в .env, чтобы только посмотреть, что будет закрыто.
 */
export async function cleanupUnknownRent(): Promise<void> {
  const walletKeypair = loadWalletKeypair();
  const owner = walletKeypair.publicKey;
  const dryRun = process.env.DRY_RUN === "true";

  const allowedMints = new Set<string>([
    QUOTE_TOKEN.MINT,
    ...COINS_CONFIG.map((c) => c.TOKEN_MINT),
  ]);

  console.log(`🔍 Кошелёк: ${owner.toBase58()}`);
  console.log(`✅ Разрешённые mint: ${Array.from(allowedMints).join(", ")}`);
  if (dryRun) console.log("🧪 DRY_RUN=true — реальные транзакции не отправляются\n");

  const tokenAccounts =
    await pub_wallet_connection.getParsedTokenAccountsByOwner(owner, {
      programId: TOKEN_PROGRAM_ID,
    });

  if (tokenAccounts.value.length === 0) {
    console.log("📭 Нет токен-аккаунтов для проверки.");
    return;
  }

  let closed = 0;
  let skipped = 0;

  for (const info of tokenAccounts.value) {
    const parsed = info.account.data.parsed.info;
    const mint: string = parsed.mint;
    const uiAmount: number = parsed.tokenAmount.uiAmount ?? 0;

    if (allowedMints.has(mint)) {
      console.log(`⏭️  Пропуск (mint в конфиге): ${mint}`);
      skipped++;
      continue;
    }

    if (uiAmount > 0) {
      console.warn(
        `⚠️  Пропуск (ненулевой баланс ${uiAmount}): ${info.pubkey.toBase58()} (${mint})`,
      );
      skipped++;
      continue;
    }

    console.log(`🧹 Закрытие: ${info.pubkey.toBase58()} (mint: ${mint})`);

    if (dryRun) {
      closed++;
      continue;
    }

    try {
      const tx = new Transaction().add(
        createCloseAccountInstruction(
          info.pubkey,
          owner, // rent вернётся сюда
          owner, // authority
          [],
          TOKEN_PROGRAM_ID,
        ),
      );

      const sig = await sendAndConfirmTransaction(
        pub_wallet_connection,
        tx,
        [walletKeypair],
      );
      console.log(`   ✅ OK: ${sig}`);
      closed++;
    } catch (err) {
      console.error(
        `   ❌ Ошибка: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log("\n─────────────────────────────────────");
  console.log(`✅ Закрыто (или было бы закрыто): ${closed}`);
  console.log(`⏭️  Пропущено: ${skipped}`);
}