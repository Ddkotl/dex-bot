import "dotenv/config";
export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type RawCandle = {
  time?: string | number;
  time_open?: string | number;
  timestamp?: string | number;
  open: string | number;
  high: string | number;
  low: string | number;
  close: string | number;
  volume?: string | number | null;
};

const API_URL = "https://api.dexpaprika.com";

function intervalSeconds(interval: string): number {
  switch (interval) {
    case "1m":
      return 60;
    case "5m":
      return 300;
    case "10m":
      return 600;
    case "15m":
      return 900;
    case "30m":
      return 1800;
    case "1h":
      return 3600;
    default:
      throw new Error(`Unsupported candle interval: ${interval}`);
  }
}

function parseTimestamp(value: string | number | undefined): number {
  if (value === undefined) {
    return Number.NaN;
  }

  if (typeof value === "number") {
    // Unix timestamp: seconds or milliseconds.
    return value > 1e12 ? Math.floor(value / 1000) : value;
  }

  const numeric = Number(value);

  if (value.trim() !== "" && Number.isFinite(numeric)) {
    return numeric > 1e12 ? Math.floor(numeric / 1000) : numeric;
  }

  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : Number.NaN;
}

export async function getKlines(
  poolAddress: string,
  tokenMint: string,
  interval: string,
  limit: number,
): Promise<Candle[]> {
  if (!poolAddress.trim()) {
    throw new Error("Pool address is required");
  }

  if (!tokenMint.trim()) {
    throw new Error("Token mint is required");
  }

  if (!Number.isInteger(limit) || limit < 2 || limit > 1000) {
    throw new Error("Candle limit must be from 2 to 1000");
  }

  const seconds = intervalSeconds(interval);

  const url = new URL(
    `${API_URL}/networks/solana/pools/` +
      `${encodeURIComponent(poolAddress.trim())}/ohlcv`,
  );

  const nowSeconds = Math.floor(Date.now() / 1000);
  const startSeconds = nowSeconds - limit * seconds;

  url.searchParams.set("start", new Date(startSeconds * 1000).toISOString());
  url.searchParams.set("end", new Date(Date.now()).toISOString());
  url.searchParams.set("interval", interval);
  url.searchParams.set("limit", String(limit));

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  // Необязательно для запросов без ключа.
  // Бесплатный ключ позволяет получать 10m+ свечи за 7 дней.
  const apiKey = process.env.DEXPAPRIKA_API_KEY?.trim();
  if (apiKey) {
    headers.Authorization = apiKey;
  }

  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const body = await response.text();

    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");

      throw new Error(
        `DexPaprika rate limit exceeded. ` +
          `Retry-After: ${retryAfter ?? "not provided"} seconds. ` +
          body,
      );
    }

    if (response.status === 403) {
      throw new Error(
        `DexPaprika denied OHLCV access. ` +
          `Check the requested interval and API plan. ${body}`,
      );
    }

    throw new Error(`DexPaprika API error ${response.status}: ${body}`);
  }

  const result: unknown = await response.json();

  // The pool OHLCV endpoint returns candle records.
  // Validate the response instead of trusting external JSON.
  let rows: unknown;

  if (Array.isArray(result)) {
    rows = result;
  } else if (
    typeof result === "object" &&
    result !== null &&
    "data" in result
  ) {
    rows = (result as { data: unknown }).data;
  }

  if (!Array.isArray(rows)) {
    throw new Error("DexPaprika response has no candle array");
  }

  const candles: Candle[] = (rows as RawCandle[]).map((row) => ({
    timestamp: parseTimestamp(row.time_open ?? row.time ?? row.timestamp),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: row.volume == null ? 0 : Number(row.volume),
  }));

  for (const candle of candles) {
    const { timestamp, open, high, low, close, volume } = candle;

    if (
      ![timestamp, open, high, low, close, volume].every(Number.isFinite) ||
      timestamp <= 0 ||
      open <= 0 ||
      high <= 0 ||
      low <= 0 ||
      close <= 0 ||
      volume < 0 ||
      high < Math.max(open, close, low) ||
      low > Math.min(open, close, high)
    ) {
      throw new Error("DexPaprika returned invalid candle data");
    }
  }

  const unique = new Map<number, Candle>();

  for (const candle of candles) {
    unique.set(candle.timestamp, candle);
  }

  const sorted = [...unique.values()].sort((a, b) => a.timestamp - b.timestamp);

  // Exclude the current, unfinished candle.
  const now = Math.floor(Date.now() / 1000);

  const closedCandles = sorted.filter(
    (candle) => candle.timestamp + seconds <= now,
  );

  if (closedCandles.length < 2) {
    throw new Error(`Not enough closed candles: ${closedCandles.length}`);
  }

  return closedCandles;
}
