
export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface MeteoraCandle {
  timestamp: number | string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume?: number | string | null;
}

interface MeteoraResponse {
  start_time: number;
  end_time: number;
  timeframe: string;
  data: MeteoraCandle[];
}

const API_URL = "https://dlmm.datapi.meteora.ag";

const BASE_INTERVAL = 300;

const INTERVALS: Record<string, number> = {
  "5m": 300,
  "10m": 600,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "2h": 7200,
  "4h": 14400,
  "12h": 43200,
  "24h": 86400,
};

function normalizeCandle(row: MeteoraCandle): Candle {
  return {
    timestamp: Number(row.timestamp),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume ?? 0),
  };
}

function validateCandle(c: Candle): boolean {
  return (
    Object.values(c).every(Number.isFinite) &&
    c.timestamp > 0 &&
    c.open > 0 &&
    c.high > 0 &&
    c.low > 0 &&
    c.close > 0 &&
    c.volume >= 0 &&
    c.high >= Math.max(c.open, c.close, c.low) &&
    c.low <= Math.min(c.open, c.close, c.high)
  );
}

/**
 * Собираем 10m и 15m из 5m свечей.
 * Используем только полные группы.
 */
function aggregateCandles(
  candles: Candle[],
  targetSeconds: number,
): Candle[] {
  const expectedCount = targetSeconds / BASE_INTERVAL;

  if (!Number.isInteger(expectedCount)) {
    throw new Error("Unsupported aggregation interval");
  }

  const groups = new Map<number, Candle[]>();

  for (const candle of candles) {
    const bucket =
      Math.floor(candle.timestamp / targetSeconds) *
      targetSeconds;

    const group = groups.get(bucket) ?? [];

    group.push(candle);

    groups.set(bucket, group);
  }

  const result: Candle[] = [];

  for (const [timestamp, group] of groups) {
    group.sort((a, b) => a.timestamp - b.timestamp);

    if (group.length !== expectedCount) {
      continue;
    }

    const complete = group.every(
      (candle, index) =>
        candle.timestamp ===
        timestamp + index * BASE_INTERVAL,
    );

    if (!complete) continue;

    const first = group[0];
    const last = group[group.length - 1];

    if (!first || !last) continue;

    result.push({
      timestamp,
      open: first.open,
      high: Math.max(...group.map(c => c.high)),
      low: Math.min(...group.map(c => c.low)),
      close: last.close,
      volume: group.reduce(
        (sum, c) => sum + c.volume,
        0,
      ),
    });
  }

  return result.sort((a, b) => a.timestamp - b.timestamp);
}

export async function getKlines(
  poolAddress: string,
  interval: string,
  limit: number,
): Promise<Candle[]> {
  if (!poolAddress.trim()) {
    throw new Error("Pool address is required");
  }

  if (!Number.isInteger(limit) || limit < 2 || limit > 1000) {
    throw new Error("Invalid candle limit");
  }

  const targetSeconds = INTERVALS[interval];

  if (!targetSeconds) {
    throw new Error(`Unsupported interval: ${interval}`);
  }

  const nativeInterval =
    targetSeconds < 1800 ? "5m" : interval;

  const sourceSeconds =
    nativeInterval === "5m"
      ? BASE_INTERVAL
      : targetSeconds;

  const now = Math.floor(Date.now() / 1000);

  // Исключаем текущую незавершённую свечу.
  const endTime =
    Math.floor(now / sourceSeconds) * sourceSeconds;

  const multiplier = targetSeconds / sourceSeconds;

  const requestedBars = Math.min(
    limit * multiplier + 5,
    1000,
  );

  const startTime =
    endTime - requestedBars * sourceSeconds;

  const url = new URL(
    `${API_URL}/pools/${encodeURIComponent(poolAddress)}/ohlcv`,
  );

  url.searchParams.set("timeframe", nativeInterval);
  url.searchParams.set("start_time", String(startTime));
  url.searchParams.set("end_time", String(endTime));

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(
      `Meteora API ${response.status}: ${await response.text()}`,
    );
  }

  const json = (await response.json()) as MeteoraResponse;

  if (!Array.isArray(json.data)) {
    throw new Error("Invalid Meteora OHLCV response");
  }

  const candles = json.data
    .map(normalizeCandle)
    .filter(validateCandle)
    .filter(c => c.timestamp < endTime)
    .sort((a, b) => a.timestamp - b.timestamp);

  const unique = new Map<number, Candle>();

  for (const candle of candles) {
    unique.set(candle.timestamp, candle);
  }

  const sourceCandles = [...unique.values()];

  let result =
    targetSeconds === sourceSeconds
      ? sourceCandles
      : aggregateCandles(sourceCandles, targetSeconds);

  result = result.slice(-limit);

  if (result.length < 2) {
    throw new Error(
      `Not enough completed Meteora candles: ${result.length}/${limit}`,
    );
  }

  return result;
}
