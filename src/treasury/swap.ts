import {
  Connection,
  Keypair,
  VersionedTransaction,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import "dotenv/config";

// ── Минты (mainnet) ──────────────────────────────────────────
export const MINTS = {
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  WSOL: "So11111111111111111111111111111111111111112",
} as const;

export const DECIMALS = { USDC: 6, USDT: 6, SOL: 9 } as const;

const JUP_API = "https://api.jup.ag/swap/v1";

/** Параметры одного свапа */
export interface SwapParams {
  connection: Connection;
  user: Keypair;
  /** Минт входа */
  inputMint: string;
  /** Минт выхода */
  outputMint: string;
  /** Сумма в RAW units (USDC 6 dec → 1_000_000 = 1 USDC; SOL 9 dec → 1e9 = 1 SOL) */
  amountRaw: bigint | number;
  /** Допустимое проскальзывание в bps (50 = 0.5%) */
  slippageBps?: number;
  /** Обернуть/развернуть SOL автоматически (для нативного SOL = true) */
  wrapAndUnwrapSol?: boolean;
  /** Приоритетная комиссия в lamports (опционально) */
  prioritizationFeeLamports?: number;
}

/**
 * Базовый свап через Jupiter v6:
 *  1. GET  /v6/quote  — оптимальный маршрут
 *  2. POST /v6/swap   — сериализованная транзакция (base64)
 *  3. deserialize → sign → sendRawTransaction → confirm
 *
 * Возвращает подпись транзакции.
 */
export async function jupiterSwap(p: SwapParams): Promise<string> {
  const {
    connection,
    user,
    inputMint,
    outputMint,
    amountRaw,
    slippageBps = 50,
    wrapAndUnwrapSol = true,
    prioritizationFeeLamports,
  } = p;

  const amount = typeof amountRaw === "bigint" ? amountRaw.toString() : String(amountRaw);

  // 1. Quote
  const quoteUrl =
    `${JUP_API}/quote?inputMint=${inputMint}` +
    `&outputMint=${outputMint}` +
    `&amount=${amount}` +
    `&slippageBps=${slippageBps}` +
    `&onlyDirectRoutes=false`;
  const quoteRes = await fetch(quoteUrl);
  if (!quoteRes.ok) {
    throw new Error(`Jupiter quote ${quoteRes.status}: ${await quoteRes.text()}`);
  }
  const quote = await quoteRes.json();
  if (!quote || !quote.outAmount) {
    throw new Error(`Jupiter вернул пустой quote: ${JSON.stringify(quote)}`);
  }

  console.log(
    `   quote: in=${quote.inAmount} out=${quote.outAmount} ` +
    `impact=${quote.priceImpactPct}% route=${quote.routePlan?.length ?? "?"}`,
  );

  // 2. Swap → сериализованная транзакция
  const swapBody: Record<string, unknown> = {
    quoteResponse: quote,
    userPublicKey: user.publicKey.toBase58(),
    wrapAndUnwrapSol,
    dynamicComputeUnitLimit: true,
  };
  if (prioritizationFeeLamports !== undefined) {
    swapBody.prioritizationFeeLamports = prioritizationFeeLamports;
  }

  const swapRes = await fetch(`${JUP_API}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(swapBody),
  });
  if (!swapRes.ok) {
    throw new Error(`Jupiter swap ${swapRes.status}: ${await swapRes.text()}`);
  }
  const { swapTransaction } = await swapRes.json();
  if (!swapTransaction) throw new Error("Jupiter не вернул swapTransaction");

  // 3. Подпись и отправка
  const txBuf = Buffer.from(swapTransaction, "base64");
  const tx = VersionedTransaction.deserialize(txBuf);
  tx.sign([user]);

  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });

  const latest = await connection.getLatestBlockhash("confirmed");
  await connection.confirmTransaction(
    { signature: sig, ...latest },
    "confirmed",
  );

  return sig;
}

// ── Публичные обёртки ────────────────────────────────────────

/** USDC → нативный SOL */
export async function swapUsdcToSol(
  connection: Connection,
  user: Keypair,
  usdcAmount: number,
  slippageBps = 50,
): Promise<string> {
  const raw = BigInt(Math.floor(usdcAmount * 10 ** DECIMALS.USDC));
  console.log(`🔄 USDC → SOL  amount=${usdcAmount} USDC  raw=${raw}`);
  return jupiterSwap({
    connection,
    user,
    inputMint: MINTS.USDC,
    outputMint: MINTS.WSOL,
    amountRaw: raw,
    slippageBps,
    wrapAndUnwrapSol: true, // развернёт WSOL → нативный SOL
  });
}

/** Нативный SOL → USDC */
export async function swapSolToUsdc(
  connection: Connection,
  user: Keypair,
  solAmount: number,
  slippageBps = 50,
): Promise<string> {
  const raw = BigInt(Math.floor(solAmount * 10 ** DECIMALS.SOL));
  console.log(`🔄 SOL → USDC  amount=${solAmount} SOL  raw=${raw}`);
  return jupiterSwap({
    connection,
    user,
    inputMint: MINTS.WSOL,
    outputMint: MINTS.USDC,
    amountRaw: raw,
    slippageBps,
    wrapAndUnwrapSol: true, // обернёт нативный SOL → WSOL
  });
}

/** Нативный SOL → USDT (для авто-конвертации прибыли) */
export async function swapSolToUsdt(
  connection: Connection,
  user: Keypair,
  solAmount: number,
  slippageBps = 50,
): Promise<string> {
  const raw = BigInt(Math.floor(solAmount * 10 ** DECIMALS.SOL));
  console.log(`🔄 SOL → USDT  amount=${solAmount} SOL  raw=${raw}`);
  return jupiterSwap({
    connection,
    user,
    inputMint: MINTS.WSOL,
    outputMint: MINTS.USDT,
    amountRaw: raw,
    slippageBps,
    wrapAndUnwrapSol: true,
  });
}

/**
 * Проверяет, есть ли у кошелька ATA для USDT.
 * Если нет — создаёт (idempotent). Нужно один раз при первом выводе в USDT.
 */
export async function ensureUsdtAta(
  connection: Connection,
  user: Keypair,
): Promise<PublicKey> {
  const mint = new PublicKey(MINTS.USDT);
  const ata = getAssociatedTokenAddressSync(mint, user.publicKey);
  const info = await connection.getAccountInfo(ata);
  if (info) return ata;

  const { createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync: gata } =
    await import("@solana/spl-token");
  const { Transaction, sendAndConfirmTransaction } = await import("@solana/web3.js");
  const tx = new Transaction().add(
    createAssociatedTokenAccountInstruction(user.publicKey, ata, user.publicKey, mint),
  );
  await sendAndConfirmTransaction(connection, tx, [user]);
  console.log(`   ✅ создан USDT ATA: ${ata.toBase58()}`);
  return ata;
}