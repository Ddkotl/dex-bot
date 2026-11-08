import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import "dotenv/config";

export function loadWalletKeypair(): Keypair {
  const raw = process.env.WALLET_SEKRET_KEY;
  if (!raw) {
    throw new Error("WALLET_SEKRET_KEY не задан в .env");
  }

  const trimmed = raw.trim();

  // Формат JSON-массива: [12, 34, 56, ...]
  if (trimmed.startsWith("[")) {
    const arr = JSON.parse(trimmed) as number[];
    if (!Array.isArray(arr) || arr.length !== 64) {
      throw new Error("WALLET_SEKRET_KEY (JSON) должен содержать 64 числа");
    }
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }

  // Base58-строка
  return Keypair.fromSecretKey(bs58.decode(trimmed));
}