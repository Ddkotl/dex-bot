import DLMM from "@meteora-ag/dlmm";
import { PublicKey } from "@solana/web3.js";
import {pub_wallet_connection} from "../client/pub_wallet_connect"


export interface Dlmmpresentation {
  positionAddress: string;
  totalTokens: number; // Количество токенов HELL внутри ячейки
  totalUsdc: number;   // Количество USDC внутри ячейки
  feeTokens: number;   // Заработанные, но не снятые комиссии в токенах
  feeUsdc: number;     // Заработанные, но не снятые комиссии в USDC
  isBuyOrder: boolean;
  isSellOrder: boolean;
}

/**
 * Получает все активные лимитные позиции (ордера) пользователя для конкретного пула
 * @param poolAddress Адрес DLMM пула (config.POOL_ADDRESS)
 * @param walletAddress Ваш публичный адрес кошелька в виде строки
 */
export async function getActiveLimitPositions(
  poolAddress: string,
  walletAddress: string,
  DECEMIALS : number
): Promise<Dlmmpresentation[]> {
  try {
    const poolPubKey = new PublicKey(poolAddress.trim());
    const userPubKey = new PublicKey(walletAddress.trim());

    // 1. Инициализируем пул Meteora из сети Solana
    const dlmmPool = await DLMM.create(pub_wallet_connection, poolPubKey);

    // 2. Вызываем корректный метод SDK для получения позиций именно по этой паре
    const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(userPubKey);

    // Получаем текущий активный ценовой шаг пула для определения направления ордеров
    const activeBin = await dlmmPool.getActiveBin();
    const currentBinId = activeBin.binId;

    const parsedPositions: Dlmmpresentation[] = [];

    for (const pos of userPositions) {
      // Данные о балансах и комиссиях хранятся в объекте positionData
      const totalX = pos.positionData.totalXAmount; // Токены (HELL)
      const totalY = pos.positionData.totalYAmount; // USDC

      const feeX = pos.positionData.feeX;     // Комиссии X
      const feeY = pos.positionData.feeY;     // Комиссии Y

      // Извлекаем массив бинов, где физически стоят средства ордера
      const bins = pos.positionData.positionBinData || [];
      const firstBinId = bins.length > 0 && bins[0] ? bins[0].binId : null;

      // Если ID бина ниже рыночного — это BUY ордер, если выше — SELL ордер
      const isBuyOrder = firstBinId ? firstBinId < currentBinId : false;
      const isSellOrder = firstBinId ? firstBinId > currentBinId : false;

      // Переводим неделимые Lamports в нормальные числа (деление на 10^6 для USDC и токена)
      // Внимание: если у монеты HELL 9 знаков после запятой, замените 1_000_000 на 1_000_000_000
      parsedPositions.push({
        positionAddress: pos.publicKey.toBase58(),
        totalTokens: Number(totalX) / DECEMIALS, 
        totalUsdc: Number(totalY) / 1_000_000,   
        feeTokens: Number(feeX) / DECEMIALS,
        feeUsdc: Number(feeY) / 1_000_000,
        isBuyOrder,
        isSellOrder
      });
    }

    return parsedPositions;
  } catch (error) {
    console.error("Ошибка при получении лимитных позиций с блокчейна:", error);
    return [];
  }
}
