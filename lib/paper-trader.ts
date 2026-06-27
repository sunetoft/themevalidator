/**
 * Paper Trading Engine
 *
 * Handles:
 * - Starting paper trades (creating orders from strategies)
 * - Checking prices via Yahoo Finance
 * - Executing/filling orders
 * - Updating positions and P&L
 */

import { prisma } from "@/lib/prisma";

/**
 * Check if NYSE is currently open.
 */
export function isNYSEOpen(): boolean {
  const now = new Date();
  const nyTime = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" })
  );
  const day = nyTime.getDay();
  const hour = nyTime.getHours();
  const minute = nyTime.getMinutes();
  const time = hour * 60 + minute; // minutes since midnight

  // Monday=1 ... Friday=5
  if (day === 0 || day === 6) return false;

  // 9:30 AM - 4:00 PM ET
  const marketOpen = 9 * 60 + 30;
  const marketClose = 16 * 60;

  return time >= marketOpen && time < marketClose;
}

/**
 * Fetch current price for a single ticker using Yahoo Finance chart API.
 * Uses the same direct API as stock-chart and cron endpoints — no npm deps needed.
 */
export async function getCurrentPrice(ticker: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
      console.error(`[paper-trader] Yahoo HTTP ${resp.status} for ${ticker}`);
      return null;
    }
    const data = await resp.json();
    const closes: (number | null)[] = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
    // Return the most recent non-null close price
    for (let i = closes.length - 1; i >= 0; i--) {
      if (closes[i] != null) return closes[i] as number;
    }
    return null;
  } catch (error) {
    console.error(`[paper-trader] Failed to fetch price for ${ticker}:`, error);
    return null;
  }
}

/**
 * Fetch prices for multiple tickers in batch.
 */
export async function getCurrentPrices(
  tickers: string[]
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  const promises = tickers.map(async (ticker) => {
    const price = await getCurrentPrice(ticker);
    if (price !== null) prices.set(ticker, price);
  });
  await Promise.all(promises);
  return prices;
}

/**
 * Parse strategy markdown into structured orders.
 * Uses a heuristic parser with fallback defaults.
 */
interface ParsedOrder {
  ticker: string;
  side: string;
  orderType: string;
  targetPrice: number;
  quantity: number;
  notes?: string;
}

function parseStrategyToOrders(
  strategyMarkdown: string,
  tickers: { ticker: string | null; marketCap?: string | null }[],
  capital: number,
  currentPrices: Map<string, number>
): ParsedOrder[] {
  const orders: ParsedOrder[] = [];
  const eligibleTickers = tickers.filter((t): t is { ticker: string; marketCap?: string | null } => t.ticker !== null);
  const perStock = capital / Math.max(eligibleTickers.length, 1);

  for (const { ticker } of eligibleTickers) {
    const price = currentPrices.get(ticker);
    if (!price) continue;

    // Try to extract from strategy text
    const tickerPattern = new RegExp(
      `\\*?\\$?${ticker}\\*?[\\s\\S]*?(?:entry|buy|limit)[\\s\\S]*?\\$?(\\d+\\.?\\d*)`,
      "i"
    );
    const stopPattern = new RegExp(
      `\\*?\\$?${ticker}\\*?[\\s\\S]*?(?:stop.?loss|stop)[\\s\\S]*?\\$?(\\d+\\.?\\d*)`,
      "i"
    );
    const tpPattern = new RegExp(
      `\\*?\\$?${ticker}\\*?[\\s\\S]*?(?:take.?profit|target|exit)[\\s\\S]*?\\$?(\\d+\\.?\\d*)`,
      "i"
    );

    const entryMatch = strategyMarkdown.match(tickerPattern);
    const stopMatch = strategyMarkdown.match(stopPattern);
    const tpMatch = strategyMarkdown.match(tpPattern);

    const entryPrice = entryMatch ? parseFloat(entryMatch[1]) : price * 0.98;
    const stopPrice = stopMatch ? parseFloat(stopMatch[1]) : price * 0.92;
    const tpPrice = tpMatch ? parseFloat(tpMatch[1]) : price * 1.15;

    const quantity = perStock / entryPrice;

    orders.push({
      ticker,
      side: "buy",
      orderType: "limit",
      targetPrice: entryPrice,
      quantity: Math.floor(quantity * 100) / 100,
    });
    orders.push({
      ticker,
      side: "sell",
      orderType: "stop-loss",
      targetPrice: stopPrice,
      quantity: Math.floor(quantity * 100) / 100,
    });
    orders.push({
      ticker,
      side: "sell",
      orderType: "take-profit",
      targetPrice: tpPrice,
      quantity: Math.floor(quantity * 100) / 100,
    });
  }

  return orders;
}

/**
 * Start a new paper trade from a strategy.
 */
export async function startPaperTrade(
  strategyId: string,
  userId: string,
  selectedTickers?: string[],
  name?: string | null
) {
  const strategy = await prisma.tradeStrategy.findUnique({
    where: { id: strategyId },
    include: {
      thesis: { include: { themeMembers: true } },
    },
  });

  if (!strategy) throw new Error("Strategy not found");

  // Filter tickers
  let eligibleMembers = strategy.thesis.themeMembers.filter(
    (m: any) => m.ticker
  );

  if (selectedTickers && selectedTickers.length > 0) {
    eligibleMembers = eligibleMembers.filter((m: any) =>
      selectedTickers.includes(m.ticker!)
    );
  }

  if (eligibleMembers.length === 0) {
    throw new Error("No eligible tickers to trade");
  }

  // Get current prices
  const tickers = eligibleMembers.map((m) => m.ticker!);
  const prices = await getCurrentPrices(tickers);

  // Create the paper trade
  const paperTrade = await prisma.paperTrade.create({
    data: {
      strategyId,
      thesisId: strategy.thesisId,
      userId,
      name: name || null,
      initialCapital: strategy.amount,
      currentCash: strategy.amount,
      totalValue: strategy.amount,
      status: "active",
    },
  });

  // Parse and create orders
  const orders = parseStrategyToOrders(
    strategy.strategy || "",
    eligibleMembers,
    strategy.amount,
    prices
  );

  for (const order of orders) {
    await prisma.paperOrder.create({
      data: {
        paperTradeId: paperTrade.id,
        ticker: order.ticker,
        side: order.side,
        orderType: order.orderType,
        targetPrice: order.targetPrice,
        quantity: order.quantity,
        status: "pending",
        notes: order.notes,
      },
    });
  }

  // Log start
  await prisma.paperTradeLog.create({
    data: {
      paperTradeId: paperTrade.id,
      action: "trade_started",
      details: `Paper trade started with ${tickers.length} tickers, $${strategy.amount} capital`,
    },
  });

  // Try immediate fill of buy limit orders
  await checkAndExecuteOrders(paperTrade.id);

  return { paperTradeId: paperTrade.id };
}

/**
 * Check prices and execute pending orders for a paper trade.
 */
export async function checkAndExecuteOrders(paperTradeId?: string) {
  const trades = paperTradeId
    ? await prisma.paperTrade.findMany({
        where: { id: paperTradeId, status: "active" },
        include: { orders: true, positions: true },
      })
    : await prisma.paperTrade.findMany({
        where: { status: "active" },
        include: { orders: true, positions: true },
      });

  const results = {
    tradesChecked: 0,
    ordersFilled: 0,
    errors: [] as string[],
  };

  for (const trade of trades) {
    results.tradesChecked++;
    try {
      // Collect all unique tickers from pending orders + positions
      const tickerSet = new Set<string>();
      for (const order of trade.orders) {
        if (order.status === "pending") tickerSet.add(order.ticker);
      }
      for (const pos of trade.positions) {
        tickerSet.add(pos.ticker);
      }

      if (tickerSet.size === 0) continue;

      const prices = await getCurrentPrices(Array.from(tickerSet));
      const nyseOpen = isNYSEOpen();

      // Log price check
      await prisma.paperTradeLog.create({
        data: {
          paperTradeId: trade.id,
          action: "price_check",
          details: `Price check: ${nyseOpen ? "NYSE OPEN" : "NYSE CLOSED"} — checked ${tickerSet.size} tickers`,
        },
      });

      // Process pending orders
      for (const order of trade.orders) {
        if (order.status !== "pending") continue;

        const currentPrice = prices.get(order.ticker);
        if (!currentPrice) continue;

        let shouldFill = false;

        if (order.orderType === "limit" && order.side === "buy") {
          shouldFill = currentPrice <= order.targetPrice;
        } else if (order.orderType === "stop-loss" && order.side === "sell") {
          shouldFill = currentPrice <= order.targetPrice;
        } else if (order.orderType === "take-profit" && order.side === "sell") {
          shouldFill = currentPrice >= order.targetPrice;
        }

        if (shouldFill) {
          // Execute the fill
          await prisma.paperOrder.update({
            where: { id: order.id },
            data: {
              status: "filled",
              filledPrice: currentPrice,
              filledAt: new Date(),
            },
          });

          results.ordersFilled++;

          // Update position
          const existingPos = trade.positions.find(
            (p: any) => p.ticker === order.ticker
          );

          if (order.side === "buy") {
            // Reduce cash, add/increase position
            const cost = order.quantity * currentPrice;
            await prisma.paperTrade.update({
              where: { id: trade.id },
              data: { currentCash: { decrement: cost } },
            });

            if (existingPos) {
              const newQty = existingPos.quantity + order.quantity;
              const newCostBasis =
                (existingPos.quantity * existingPos.avgCostBasis +
                  order.quantity * currentPrice) /
                newQty;
              await prisma.paperPosition.update({
                where: { id: existingPos.id },
                data: {
                  quantity: newQty,
                  avgCostBasis: newCostBasis,
                  currentPrice,
                },
              });
            } else {
              await prisma.paperPosition.create({
                data: {
                  paperTradeId: trade.id,
                  ticker: order.ticker,
                  quantity: order.quantity,
                  avgCostBasis: currentPrice,
                  currentPrice,
                },
              });
            }
          } else {
            // Sell: increase cash, reduce/close position
            const proceeds = order.quantity * currentPrice;
            await prisma.paperTrade.update({
              where: { id: trade.id },
              data: { currentCash: { increment: proceeds } },
            });

            if (existingPos) {
              const newQty = Math.max(
                0,
                existingPos.quantity - order.quantity
              );
              if (newQty === 0) {
                await prisma.paperPosition.delete({
                  where: { id: existingPos.id },
                });
              } else {
                await prisma.paperPosition.update({
                  where: { id: existingPos.id },
                  data: { quantity: newQty, currentPrice },
                });
              }
            }
          }

          await prisma.paperTradeLog.create({
            data: {
              paperTradeId: trade.id,
              action: "order_filled",
              ticker: order.ticker,
              details: `${order.side.toUpperCase()} ${order.quantity} ${order.ticker} @ $${currentPrice.toFixed(2)} (${order.orderType})`,
              priceAtAction: currentPrice,
            },
          });
        }
      }

      // Update positions with current prices + P&L
      const updatedPositions = await prisma.paperPosition.findMany({
        where: { paperTradeId: trade.id },
      });

      let totalPositionValue = 0;
      for (const pos of updatedPositions) {
        const currentPrice = prices.get(pos.ticker);
        if (currentPrice !== undefined) {
          const marketValue = pos.quantity * currentPrice;
          const unrealizedPnl =
            marketValue - pos.quantity * pos.avgCostBasis;
          totalPositionValue += marketValue;
          await prisma.paperPosition.update({
            where: { id: pos.id },
            data: {
              currentPrice,
              marketValue,
              unrealizedPnl,
              lastUpdatedAt: new Date(),
            },
          });
        }
      }

      // Update trade totals
      const updatedTrade = await prisma.paperTrade.findUnique({
        where: { id: trade.id },
      });
      if (updatedTrade) {
        const totalValue = updatedTrade.currentCash + totalPositionValue;
        const pnl = totalValue - updatedTrade.initialCapital;
        const pnlPercent =
          (pnl / updatedTrade.initialCapital) * 100;

        await prisma.paperTrade.update({
          where: { id: trade.id },
          data: {
            totalValue,
            pnl,
            pnlPercent,
            lastCheckedAt: new Date(),
          },
        });

        // Save a snapshot for Sharpe ratio calculation
        const finalPositions = await prisma.paperPosition.findMany({
          where: { paperTradeId: trade.id },
          select: { ticker: true, marketValue: true, unrealizedPnl: true, quantity: true },
        });
        const positionsJson: Record<string, { marketValue: number; unrealizedPnl: number; quantity: number }> = {};
        for (const p of finalPositions) {
          positionsJson[p.ticker] = {
            marketValue: p.marketValue,
            unrealizedPnl: p.unrealizedPnl,
            quantity: p.quantity,
          };
        }
        await prisma.paperTradeSnapshot.create({
          data: {
            paperTradeId: trade.id,
            totalValue,
            pnl,
            pnlPercent,
            positions: positionsJson,
          },
        });
      }
    } catch (error: any) {
      results.errors.push(`Trade ${trade.id}: ${error.message}`);
    }
  }

  return results;
}
