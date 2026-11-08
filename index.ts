import "dotenv/config";
import { COINS_CONFIG } from "./src/config";
import { tradeLoop } from "./src/strategy/trade_loop";
import { sleep } from "./src/utits/sleep";
import { loadWalletKeypair } from "./src/utits/keypair";

async function startMultiBot() {
  const user = loadWalletKeypair();

  console.log(`Бот инициализирует торговлю для ${COINS_CONFIG.length} пар...`);

  // 1. Торговые циклы (как было, с разбегом)
  const tradingPromises = COINS_CONFIG.map(async (coinConfig, index) => {
    await sleep(index * 6111);
    return tradeLoop(coinConfig);
  });

  // 2. Казначейство: авто-конвертация SOL→USDT раз в час
  // const treasuryPromise = startAutoConvert(pub_wallet_connection, user);

  // 3. Ждём всё вместе (на практике — до Ctrl+C)
  await Promise.all([...tradingPromises]);
}

startMultiBot().catch((err) => {
  console.error(
    "❌ Фатальная ошибка:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
