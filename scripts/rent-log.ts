import { logRentDeposits } from "../src/get_info/get_ata_rent_to_blockchain";

logRentDeposits().catch((err) => {
  console.error("❌", err instanceof Error ? err.message : err);
  process.exit(1);
});