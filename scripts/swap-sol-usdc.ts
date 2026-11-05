import "dotenv/config";
import { pub_wallet_connection } from "../src/client/pub_wallet_connect";
import { loadWalletKeypair } from "../src/utits/keypair";
import { swapSolToUsdc } from "../src/treasury/swap";

async function main() {
  const amount = Number(process.argv[2]);
  if (!Number.isFinite(amount) || amount <= 0) {
    console.error("Usage: npm run swap:sol-usdc <SOL_AMOUNT>");
    process.exit(1);
  }
  const user = loadWalletKeypair();
  const sig = await swapSolToUsdc(pub_wallet_connection, user, amount, 50);
  console.log(`✅ sig=${sig}`);
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});