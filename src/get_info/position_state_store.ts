
import fs from "node:fs";
import path from "node:path";

export type PositionSide = "BUY" | "SELL";

export interface StoredPosition {
  side: PositionSide;
  buyEntryPrice?: number;
  symbol: string;
  tokenMint: string;
  poolAddress: string;
  createdAt?: number;
  targetPrice?: number;
}

export interface PositionMetadata {
  symbol: string;
  tokenMint: string;
  poolAddress: string;
}

type Store = Record<string, StoredPosition>;

const DIR = path.join(process.cwd(), "data");
const FILE = path.join(DIR, "position_state.json");

function readStore(): Store {
  if (!fs.existsSync(FILE)) return {};

  const parsed: unknown = JSON.parse(
    fs.readFileSync(FILE, "utf8"),
  );

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

function isValidPrice(price: unknown): price is number {
  return (
    typeof price === "number" &&
    Number.isFinite(price) &&
    price > 0
  );
}

export function getStoredPosition(
  positionAddress: string,
): StoredPosition | null {
  return readStore()[positionAddress] ?? null;
}

export function getStoredPositionSide(
  positionAddress: string,
): PositionSide | null {
  return getStoredPosition(positionAddress)?.side ?? null;
}

export function getStoredBuyEntryPrice(
  positionAddress: string,
): number | null {
  const price = getStoredPosition(positionAddress)?.buyEntryPrice;

  return isValidPrice(price) ? price : null;
}

export function getStoredPositionsForPool(
  poolAddress: string,
): Array<{ address: string; position: StoredPosition }> {
  return Object.entries(readStore())
    .filter(([, position]) => position.poolAddress === poolAddress)
    .map(([address, position]) => ({
      address,
      position,
    }));
}

export function getStoredBuyEntryPriceForPool(
  poolAddress: string,
): number | null {
  const prices = getStoredPositionsForPool(poolAddress)
    .map(({ position }) => position.buyEntryPrice)
    .filter(isValidPrice);

  const uniquePrices = [...new Set(prices)];

  if (uniquePrices.length === 0) return null;

  if (uniquePrices.length !== 1) {
    console.error(
      `[POSITION STORE] Разные buyEntryPrice для ${poolAddress}:`,
      uniquePrices,
    );

    return null;
  }

  return uniquePrices[0] ?? null;
}

export function savePosition(
  positionAddress: string,
  side: PositionSide,
  metadata: PositionMetadata,
  buyEntryPrice?: number,
  targetPrice?: number,
): void {
  if (buyEntryPrice !== undefined && !isValidPrice(buyEntryPrice)) {
    throw new Error(`Некорректная цена BUY: ${buyEntryPrice}`);
  }

  if (targetPrice !== undefined && !isValidPrice(targetPrice)) {
    throw new Error(`Некорректная targetPrice: ${targetPrice}`);
  }

  if (!metadata.symbol || !metadata.tokenMint || !metadata.poolAddress) {
    throw new Error("Не заполнены метаданные позиции");
  }

  const store = readStore();

  store[positionAddress] = {
    side,
    ...(buyEntryPrice !== undefined ? { buyEntryPrice } : {}),
    ...(targetPrice !== undefined ? { targetPrice } : {}),
    symbol: metadata.symbol,
    tokenMint: metadata.tokenMint,
    poolAddress: metadata.poolAddress,
    createdAt: Date.now(),
  };

  writeStore(store);

  console.log(
    `[POSITION STORE] SAVE ${metadata.symbol} ${side} ` +
    `${positionAddress} target=${targetPrice ?? "нет"} ` +
    `entry=${buyEntryPrice ?? "нет"}`,
  );
}

export function removePosition(positionAddress: string): void {
  const store = readStore();

  if (!(positionAddress in store)) return;

  const oldPosition = store[positionAddress];

  delete store[positionAddress];

  writeStore(store);

  console.log(
    `[POSITION STORE] REMOVE ${oldPosition?.symbol ?? "UNKNOWN"} ` +
    `${positionAddress}`,
  );
}

export function prunePositionsForPool(
  _poolAddress: string,
  _activeAddresses: ReadonlySet<string>,
): void {
  // Автоматическое удаление отключено.
  // Записи удаляются только после успешных торговых операций.
}

export function savePositionSide(
  positionAddress: string,
  side: PositionSide,
  buyEntryPrice?: number,
  metadata?: PositionMetadata,
): void {
  if (!metadata) {
    throw new Error(
      "savePositionSide: необходимо передать PositionMetadata",
    );
  }

  savePosition(positionAddress, side, metadata, buyEntryPrice);
}

export function removePositionSide(positionAddress: string): void {
  removePosition(positionAddress);
}
