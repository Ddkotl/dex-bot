import { cleanupUnknownRent } from "../src/actions/cleanupUnknownRent";

cleanupUnknownRent().catch((err) => {
  console.error("❌", err instanceof Error ? err.message : err);
  process.exit(1);
});