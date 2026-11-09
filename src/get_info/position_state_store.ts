import fs from "node:fs";
import path from "node:path";

export type PositionSide = "BUY" | "SELL";

export interface StoredPosition {
  side: PositionSide;
  buyEntryPrice?: number;
}

type Store = Record<string, StoredPosition>;

const DIR = path.join(process.cwd(), "data");
const FILE = path.join(DIR, "position_state.json");

function readStore(): Store {
  console.log("[POSITION STORE] cwd:", process.cwd());
  console.log("[POSITION STORE] file:", FILE);
  console.log("[POSITION STORE] exists:", fs.existsSync(FILE));

  if (!fs.existsSync(FILE)) {
    console.log("[POSITION STORE] Файл не найден, возвращаю пустое состояние");
    return {};
  }

  const raw = fs.readFileSync(FILE, "utf8");

  console.log("[POSITION STORE] raw:", raw);

  const parsed: unknown = JSON.parse(raw);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Некорректный формат position_state.json");
  }

  return parsed as Store;
}

function writeStore(store: Store): void {
  fs.mkdirSync(DIR, { recursive: true });

  const temp = `${FILE}.tmp`;

  fs.writeFileSync(temp, JSON.stringify(store, null, 2), "utf8");

  fs.renameSync(temp, FILE);
}

export function getStoredPosition(
  positionAddress: string,
): StoredPosition | null {
  return readStore()[positionAddress] ?? null;
}

export function getStoredPositionSide(
  positionAddress: string,
): PositionSide | null {
  const store = readStore();

  console.log("[POSITION STORE] requested address:", positionAddress);
  console.log("[POSITION STORE] available addresses:", Object.keys(store));

  const position = store[positionAddress];

  console.log("[POSITION STORE] found position:", position);

  return position?.side ?? null;
}

export function getStoredBuyEntryPrice(positionAddress: string): number | null {
  const price = getStoredPosition(positionAddress)?.buyEntryPrice;

  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  return price;
}

export function savePosition(
  positionAddress: string,
  side: PositionSide,
  buyEntryPrice?: number,
): void {
  if (
    buyEntryPrice !== undefined &&
    (!Number.isFinite(buyEntryPrice) || buyEntryPrice <= 0)
  ) {
    throw new Error(`Некорректная цена BUY: ${buyEntryPrice}`);
  }

  const store = readStore();

  store[positionAddress] = {
    side,
    ...(buyEntryPrice !== undefined ? { buyEntryPrice } : {}),
  };

  writeStore(store);
}

export function removePosition(positionAddress: string): void {
  const store = readStore();

  delete store[positionAddress];

  writeStore(store);
}

// Совместимость со старым get_positions.ts и старым execute.ts.
export function savePositionSide(
  positionAddress: string,
  side: PositionSide,
  buyEntryPrice?: number,
): void {
  savePosition(positionAddress, side, buyEntryPrice);
}

export function removePositionSide(positionAddress: string): void {
  removePosition(positionAddress);
}
