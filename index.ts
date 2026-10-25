import { getQuote, USDC_MINT } from "./src/jupiter";

// Адрес смарт-контракта "обернутого" SOL в сети Solana (WSOL)
const SOL_MINT = "So11111111111111111111111111111111111111112";

async function testPriceFetch() {
  console.log("⏳ Запрашиваем цену SOL на DEX через Jupiter API...");

  // Имитируем продажу 1 USDC (1 * 10^6 неделимых единиц)
  const amountToSpend = 1 * 1_000_000; 

  const quote = await getQuote(USDC_MINT, SOL_MINT, amountToSpend);

  if (quote) {
    // У SOL 9 знаков после запятой, переводим результат в понятный вид
    const solReceived = Number(quote.outAmount) / 1_000_000_000;
    
    // Вычисляем цену 1 SOL в долларах
    const priceOfOneSol = 1 / solReceived;

    console.log(`\n=== 📈 РЫНОЧНЫЕ ДАННЫЕ С DEX ===`);
    console.log(`За 1 USDC мы получим: ${solReceived.toFixed(6)} SOL`);
    console.log(`Текущая цена 1 SOL:    $${priceOfOneSol.toFixed(2)} USDC`);
    console.log(`Влияние на цену (Price Impact): ${quote.priceImpactPct}%`);
    console.log(`================================\n`);
  } else {
    console.log("❌ Не удалось получить котировку.");
  }
}

testPriceFetch();
