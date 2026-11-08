
import { promises as fs } from "node:fs";
import path from "node:path";

export interface TrackedPosition {
  poolAddress: string;
  positionAddress: string;
  side: "buy" | "sell";
  binId: number;
}

const STATE_DIR = path.join(process.cwd(), "data");
const STATE_FILE = path.join(STATE_DIR, "dlmm_positions.json");

type PositionState = Record<string, TrackedPosition>;

async function readState(): Promise<PositionState> {
  try {
    const content = await fs.readFile(STATE_FILE, "utf8");
    return JSON.parse(content) as PositionState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function writeState(state: PositionState): Promise<void> {
  await fs.mkdir(STATE_DIR, { recursive: true });

  const tempFile = `${STATE_FILE}.tmp`;

  await fs.writeFile(
    tempFile,
    JSON.stringify(state, null, 2),
    "utf8",
  );

  await fs.rename(tempFile, STATE_FILE);
}

export async function getTrackedPosition(
  poolAddress: string,
): Promise<TrackedPosition | null> {
  const state = await readState();
  return state[poolAddress] ?? null;
}

export async function saveTrackedPosition(
  position: TrackedPosition,
): Promise<void> {
  const state = await readState();
  state[position.poolAddress] = position;
  await writeState(state);
}

export async function clearTrackedPosition(
  poolAddress: string,
): Promise<void> {
  const state = await readState();
  delete state[poolAddress];
  await writeState(state);
}
