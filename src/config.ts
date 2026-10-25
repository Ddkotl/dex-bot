export interface TokenConfig {
  TICKER: string; // Короткое имя для логов (например, "SOL", "JUP")
  MINT: string; // Адрес смарт-контракта (Mint Address) в Solana
  USDC_ALLOCATION: number; // Сколько долларов (USDC) выделять на ОДНУ сделку по этой монете
  SLIPPAGE_BPS: number; // Допустимое проскальзывание для этой монеты (100 = 1%)

  // Параметры вашей стратегии скальпинга (переносим логику флета)
  TAKE_PROFIT_PCT: number; // Процент профита для выхода
  STOP_LOSS_PCT: number; // Процент стоп-лосса
  CHECK_INTERVAL_MS: number; // Как часто проверять цену (в миллисекундах)
}

// Глобальные настройки самого бота
export const BOT_GLOBAL_CONFIG = {
  // Базовый стейблкоин, с которого бот берет средства для торговли
  BASE_STABLE_MINT: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // Официальный USDC
  BASE_STABLE_DECIMALS: 6, // У USDC всегда 6 знаков после запятой

  // Защитная пауза после срабатывания Стоп-Лосса (например, 5 минут)
  COOLDOWN_AFTER_STOPLOSS_MS: 5 * 60 * 60 * 1000,
};

// Список монет, которые бот будет сканировать и торговать параллельно
export const TOKENS_TO_TRADE: TokenConfig[] = [
  {
    TICKER: "BatCat",
    MINT: "HCkhfdDNF2dqMxxtL51AzgWU26MBNkUkEzGAHtqkpump", // Токен агрегатора Jupiter
    USDC_ALLOCATION: 2,
    SLIPPAGE_BPS: 20, // 0.5% проскальзывание
    TAKE_PROFIT_PCT: 2.0,
    STOP_LOSS_PCT: 1.2,
    CHECK_INTERVAL_MS: 15000,
  },
];
