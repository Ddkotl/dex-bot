import { PublicKey } from "@solana/web3.js";

// Официальный адрес смарт-контракта USDC в сети Solana
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export interface JupiterQuote {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: any[];
}

/**
 * Получает лучшую цену (котировку) обмена между двумя токенами через актуальный Swap API V1
 */
export async function getQuote(
  inputMint: string,
  outputMint: string,
  amountInUnits: number,
  slippageBps: number = 100 // По умолчанию 0.5% (50 базисных пунктов)
): Promise<JupiterQuote | null> {
  try {
    // ОБНОВЛЕНО: Используем актуальный путь /swap/v1/quote
    const url = `https://api.jup.ag/swap/v1/quote?` +
      `inputMint=${inputMint}` +
      `&outputMint=${outputMint}` +
      `&amount=${amountInUnits}` +
      `&slippageBps=${slippageBps}` +
      `&swapMode=ExactIn`; // Указываем точный режим обмена

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    
    const responseText = await response.text();

    if (!response.ok) {
      console.error(`⚠️ Jupiter API Error Response: ${responseText}`);
      return null;
    }

    if (responseText.trim().startsWith("<!DOCTYPE")) {
      console.error("❌ Сервер Jupiter вернул HTML вместо JSON. Возможна блокировка.");
      return null;
    }

    return JSON.parse(responseText) as JupiterQuote;
  } catch (error) {
    console.error("💥 Ошибка при запросе котировки у Jupiter:", error);
    return null;
  }
}
