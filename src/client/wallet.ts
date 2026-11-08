import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import "dotenv/config";

const raw = process.env.WALLET_SEKRET_KEY; // ← твоё имя из .env
if (!raw) throw new Error("WALLET_SEKRET_KEY не задан в .env");

const trimmed = raw.trim();
let secret: Uint8Array;

if (trimmed.startsWith("[")) {
  secret = Uint8Array.from(JSON.parse(trimmed));
} else {
  secret = bs58.decode(trimmed);
}

if (secret.length !== 64) {
  throw new Error(
    `secret key должен быть 64 байта, получено ${secret.length}. ` +
    `Проверь WALLET_SEKRET_KEY в .env (ожидается base58 ~88 символов или JSON-массив).`
  );
}

export const wallet = Keypair.fromSecretKey(secret);