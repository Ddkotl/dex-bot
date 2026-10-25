import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import dotenv from "dotenv";

dotenv.config();

const rpcUrl = process.env.SOLANA_RPC_URL || "https://solana.com";
const privateKeyRaw = process.env.SOLANA_PRIVATE_KEY;

if (!privateKeyRaw) {
  throw new Error("❌ Ошибка: SOLANA_PRIVATE_KEY не найден в файле .env");
}

// Инициализируем подключение к блокчейну Solana
export const connection = new Connection(rpcUrl, "confirmed");

// Функция безопасного восстановления кошелька из любого формата (Base58 или Array)
function getWalletKeypair(keyRaw: string): Keypair {
  try {
    if (keyRaw.trim().startsWith("[")) {
      const parts = JSON.parse(keyRaw);
      return Keypair.fromSecretKey(Uint8Array.from(parts));
    } else {
      return Keypair.fromSecretKey(bs58.decode(keyRaw.trim()));
    }
  } catch (err) {
    throw new Error("❌ Критическая ошибка: Неверный формат приватного ключа в .env");
  }
}

export const botWallet = getWalletKeypair(privateKeyRaw);

console.log(`✅ Бот успешно подключен. Публичный адрес кошелька: ${botWallet.publicKey.toString()}`);
