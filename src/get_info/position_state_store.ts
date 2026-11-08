import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export type StoredPositionSide = "BUY" | "SELL";

interface StoredPosition {
  side: StoredPositionSide;
  createdAt: string;
}

type PositionStateFile = Record<string, StoredPosition>;

const DATA_DIR = path.resolve(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "position-state.json");

function readState(): PositionStateFile {
  if (!existsSync(STATE_FILE)) {
    return {};
  }

  try {
    return JSON.parse(
      readFileSync(STATE_FILE, "utf8"),
    ) as PositionStateFile;
  } catch (error) {
    throw new Error(
      `Не удалось прочитать ${STATE_FILE}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function writeState(state: PositionStateFile): void {
  mkdirSync(DATA_DIR, { recursive: true });

  const tempFile = `${STATE_FILE}.tmp`;

  writeFileSync(
    tempFile,
    JSON.stringify(state, null, 2),
    "utf8",
  );

  renameSync(tempFile, STATE_FILE);
}

export function savePositionSide(
  positionAddress: string,
  side: StoredPositionSide,
): void {
  const state = readState();

  state[positionAddress] = {
    side,
    createdAt: new Date().toISOString(),
  };

  writeState(state);

  console.log(
    `[POSITION STATE] Сохранено: ${side} ${positionAddress}`,
  );
}

export function getStoredPositionSide(
  positionAddress: string,
): StoredPositionSide | "UNKNOWN" {
  const state = readState();
  return state[positionAddress]?.side ?? "UNKNOWN";
}

export function removePositionSide(positionAddress: string): void {
  const state = readState();

  if (state[positionAddress]) {
    delete state[positionAddress];
    writeState(state);

    console.log(
      `[POSITION STATE] Удалено: ${positionAddress}`,
    );
  }
}