import { Connection, Keypair } from "@solana/web3.js";
import { swapSolToUsdt, ensureUsdtAta } from "./swap";
import "dotenv/config";

const ONE_HOUR_MS = 60 * 60 * 1000;

/** Порог, выше которого SOL конвертируется в USDT */
const SOL_THRESHOLD = 3;

/** Сколько SOL оставить на газ/rent после конвертации */
const SOL_RESERVE = 2;

/**
 * Один проход авто-конвертации:
 *  - читает нативный SOL кошелька
 *  - если > SOL_THRESHOLD → свапает (SOL - SOL_RESERVE) в USDT
 *  - если SOL ≤ SOL_THRESHOLD → лог и выход
 */
export async function autoConvertOnce(
  connection: Connection,
  user: Keypair,
): Promise<void> {
  const lamports = await connection.getBalance(user.publicKey);
  const sol = lamports / 1e9;

  console.log(
    `[Treasury] SOL balance = ${sol.toFixed(4)} ` +
      `(порог ${SOL_THRESHOLD}, резерв ${SOL_RESERVE})`,
  );

  if (sol <= SOL_THRESHOLD) {
    console.log(`[Treasury] ниже порога — конвертация не нужна`);
    return;
  }

  const toSwap = sol - SOL_RESERVE;
  if (toSwap <= 0) {
    console.log(`[Treasury] нечего свапать после резерва`);
    return;
  }

  await ensureUsdtAta(connection, user);
  const sig = await swapSolToUsdt(connection, user, toSwap, 50);

  const after = (await connection.getBalance(user.publicKey)) / 1e9;
  console.log(
    `[Treasury] ✅ конвертировано ${toSwap.toFixed(4)} SOL → USDT  ` +
      `sig=${sig}  остаток SOL=${after.toFixed(4)}`,
  );
}

/**
 * Часовой цикл авто-конвертации. Запускается параллельно с торговыми
 * циклами; не блокирует торговлю. При SIGINT завершается корректно.
 */
export async function startAutoConvert(
  connection: Connection,
  user: Keypair,
): Promise<void> {
  console.log(
    `💰 [Treasury] авто-конвертация SOL→USDT запущена ` +
      `(порог ${SOL_THRESHOLD} SOL, проверка каждый час)`,
  );

  let stopped = false;
  const stop = () => {
    stopped = true;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  while (!stopped) {
    try {
      await autoConvertOnce(connection, user);
    } catch (err) {
      console.error(
        `[Treasury] ошибка авто-конвертации:`,
        err instanceof Error ? err.message : err,
      );
    }

    // Спим час, но просыпаемся при SIGINT
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, ONE_HOUR_MS);
      const check = setInterval(() => {
        if (stopped) {
          clearTimeout(t);
          clearInterval(check);
          resolve();
        }
      }, 1000);
    });
  }

  console.log(`💰 [Treasury] авто-конвертация остановлена`);
}
