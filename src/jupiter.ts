const API_URL = "https://api.jup.ag/swap/v2/order";

// Официальные адреса токенов Solana
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL_MINT = "So11111111111111111111111111111111111111112";

type JupiterQuote = {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  router?: string;
  feeBps?: number;
  priceImpact?: string;
  priceImpactPct?: string;
  transaction?: string | null;
};

async function getQuote(
  inputMint: string,
  outputMint: string,
  amount: string,
): Promise<JupiterQuote> {
  const url = new URL(API_URL);
  url.searchParams.set("inputMint", inputMint);
  url.searchParams.set("outputMint", outputMint);
  url.searchParams.set("amount", amount);

  const headers: Record<string, string> = {};
  const apiKey = process.env.JUPITER_API_KEY;

  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(
      `Jupiter API error ${response.status}: ${await response.text()}`,
    );
  }

  const data = (await response.json()) as JupiterQuote;

  if (
    !data.inAmount ||
    !data.outAmount ||
    !Number.isFinite(Number(data.outAmount)) ||
    Number(data.outAmount) <= 0
  ) {
    throw new Error("Jupiter returned an invalid quote");
  }

  return data;
}

export async function checkRoundTrip(amountUsdc: number): Promise<void> {
  if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
    throw new Error("Amount must be a positive number");
  }

  // USDC has 6 decimal places.
  const amountIn = Math.round(amountUsdc * 1_000_000);

  console.log(`\nChecking round trip for ${amountUsdc} USDC...`);

  // 1. Simulate buying SOL with USDC.
  const buy = await getQuote(USDC_MINT, SOL_MINT, String(amountIn));

  // 2. Simulate selling exactly the quoted SOL amount back to USDC.
  // Jupiter's keyless rate limit is 0.5 requests/second.
  await new Promise((resolve) => setTimeout(resolve, 2_100));

  const sell = await getQuote(SOL_MINT, USDC_MINT, buy.outAmount);

  const usdcAfterSale = Number(sell.outAmount) / 1_000_000;
  const pnl = usdcAfterSale - amountUsdc;
  const pnlPct = (pnl / amountUsdc) * 100;

  console.log("--- PAPER TRADE RESULT ---");
  console.log(`USDC spent:       ${amountUsdc.toFixed(6)}`);
  console.log(`SOL quoted:       ${buy.outAmount} lamports`);
  console.log(`USDC after sale:  ${usdcAfterSale.toFixed(6)}`);
  console.log(`Estimated P/L:    ${pnl.toFixed(6)} USDC`);
  console.log(`Estimated return: ${pnlPct.toFixed(4)}%`);
  console.log(`Buy route:        ${buy.router ?? "not reported"}`);
  console.log(`Sell route:       ${sell.router ?? "not reported"}`);
  console.log("--------------------------");
}
