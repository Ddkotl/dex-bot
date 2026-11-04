import { Connection } from "@solana/web3.js";
import "dotenv/config";
export const pub_wallet_connection = new Connection(
  process.env.SOLANA_RPC_URL || "https://solana.com",
  "confirmed",
);
