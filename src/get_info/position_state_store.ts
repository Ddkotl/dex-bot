import fs from "node:fs";
import path from "node:path";

export type PositionSide = "BUY" | "SELL";

export interface StoredPosition {
  side: PositionSide;
  buyEntryPrice?: number;
  symbol: string;
  tokenMint: string;
  poolAddress: string;
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
  if (!fs.existsSync(FILE)) {
    return {};
  }

  const raw = fs.readFileSync(FILE, "utf8");
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

function isValidPrice(price: unknown): price is number {
  return typeof price === "number" && Number.isFinite(price) && price > 0;
}

export function getStoredPosition(
  positionAddress: string,
): StoredPosition | null {
  return readStore()[positionAddress] ?? null;
}

export function getStoredPositionSide(
  positionAddress: string,
): PositionSide | null {
  const position = getStoredPosition(positionAddress);

  return position?.side ?? null;
}

export function getStoredBuyEntryPrice(positionAddress: string): number | null {
  const price = getStoredPosition(positionAddress)?.buyEntryPrice;

  return isValidPrice(price) ? price : null;
}

/**
 * Возвращает все сохранённые записи указанного пула.
 * В том числе записи BUY, которые уже закрыты on-chain,
 * но ещё не перенесены в новую SELL.
 */
export function getStoredPositionsForPool(
  poolAddress: string,
): Array<{ address: string; position: StoredPosition }> {
  const store = readStore();

  return Object.entries(store)
    .filter(([, position]) => position.poolAddress === poolAddress)
    .map(([address, position]) => ({
      address,
      position,
    }));
}

/**
 * Ищет цену покупки среди сохранённых записей пула.
 *
 * Если цены в нескольких записях различаются,
 * возвращает null: выбирать одну из них наугад нельзя.
 */
export function getStoredBuyEntryPriceForPool(
  poolAddress: string,
): number | null {
  const entries = getStoredPositionsForPool(poolAddress);

  const prices = entries
    .map(({ position }) => position.buyEntryPrice)
    .filter(isValidPrice);

  if (prices.length === 0) {
    return null;
  }

  const uniquePrices = [...new Set(prices)];

  if (uniquePrices.length !== 1) {
    console.error(
      `[POSITION STORE] Несколько разных buyEntryPrice для пула ${poolAddress}:`,
      uniquePrices,
    );

    return null;
  }

  return uniquePrices[0] ?? null;
}

/**
 * Сохраняет или перезаписывает состояние позиции.
 * Ключ — адрес DLMM-позиции.
 */
export function savePosition(
  positionAddress: string,
  side: PositionSide,
  metadata: PositionMetadata,
  buyEntryPrice?: number,
): void {
  if (buyEntryPrice !== undefined && !isValidPrice(buyEntryPrice)) {
    throw new Error(`Некорректная цена BUY: ${buyEntryPrice}`);
  }

  if (!metadata.symbol || !metadata.tokenMint || !metadata.poolAddress) {
    throw new Error("Не заполнены метаданные позиции");
  }

  const store = readStore();

  store[positionAddress] = {
    side,
    ...(buyEntryPrice !== undefined ? { buyEntryPrice } : {}),
    symbol: metadata.symbol,
    tokenMint: metadata.tokenMint,
    poolAddress: metadata.poolAddress,
  };

  writeStore(store);

  console.log(
    `[POSITION STORE] SAVE ${metadata.symbol} ${side} ` +
      `${positionAddress} entry=${buyEntryPrice ?? "нет"}`,
  );
}

/**
 * Удаляет запись конкретной позиции.
 */
export function removePosition(positionAddress: string): void {
  const store = readStore();

  if (!(positionAddress in store)) {
    return;
  }

  const oldPosition = store[positionAddress];

  delete store[positionAddress];

  writeStore(store);

  console.log(
    `[POSITION STORE] REMOVE ${oldPosition?.symbol ?? "UNKNOWN"} ` +
      `${positionAddress}`,
  );
}

/**
 * Оставлена для совместимости со старым кодом.
 * Не вызывай её автоматически после одного ответа RPC:
 * можно удалить цену входа незавершённой сделки.
 */
export function prunePositionsForPool(
  poolAddress: string,
  activeAddresses: ReadonlySet<string>,
): void {
  const store = readStore();

  let changed = false;

  for (const [address, position] of Object.entries(store)) {
    if (position.poolAddress === poolAddress && !activeAddresses.has(address)) {
      console.warn(
        `[POSITION STORE] STALE RECORD: ${position.symbol} ${address}`,
      );

      // Намеренно не удаляем автоматически.
      // Удаление выполняется после успешного перехода сделки.
    }
  }

  if (changed) {
    writeStore(store);
  }
}

// Совместимость со старым API.
export function savePositionSide(
  positionAddress: string,
  side: PositionSide,
  buyEntryPrice?: number,
  metadata?: PositionMetadata,
): void {
  if (!metadata) {
    throw new Error("savePositionSide: необходимо передать PositionMetadata");
  }

  savePosition(positionAddress, side, metadata, buyEntryPrice);
}

export function removePositionSide(positionAddress: string): void {
  removePosition(positionAddress);
}
