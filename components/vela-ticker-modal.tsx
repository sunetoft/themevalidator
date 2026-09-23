'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, TrendingUp, TrendingDown, LineChart, RefreshCw } from 'lucide-react';
import {
  TICKER_TIMEFRAMES,
  TIMEFRAME_LABELS,
  EMA_SET,
  EMA_COLORS,
  addEmaStack,
  clearOverlayLines,
  drawExpectedMoves,
  fetchChartPayload,
  createTickerProvider,
  type ExpectedMove,
  type TickerTimeframe,
} from '@/lib/vela-ticker';

interface Props {
  ticker: string;
  companyName?: string;
  onClose: () => void;
}

interface Payload {
  spot: number | null;
  expectedMoves: ExpectedMove[];
}

/**
 * Ticker chart modal powered by LuxAlgo Vela (same engine as SaxoAITrader /charts):
 * EMA 9/21/50/130 stack + expected-move overlay (spot ± 0.85 × ATM straddle) for
 * the next three Friday expiries.
 */
export default function VelaTickerModal({ ticker, companyName, onClose }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const [timeframe, setTimeframe] = useState<TickerTimeframe>('D');
  const [chartReady, setChartReady] = useState(false);
  const [showEm, setShowEm] = useState(true);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [levelsLoading, setLevelsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mountKey, setMountKey] = useState(0);

  // Esc to close + lock body scroll
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  // ── mount Vela (dynamic import — DOM/WebGL lib, never SSR'd) ───────────────
  useEffect(() => {
    let cancelled = false;
    setChartReady(false);
    setError(null);

    (async () => {
      try {
        const { Vela } = await import('@luxalgo/vela');
        if (cancelled || !hostRef.current) return;
        const chart = new Vela(hostRef.current, {
          // route explicit symbols through our own provider (no symbol indexing needed)
          symbol: `yahoo:${ticker}`,
          timeframe,
          live: false,
          theme: 'dark',
        });
        chart.data.registerProvider('yahoo', createTickerProvider());
        await chart.ready();
        if (cancelled) {
          chart.destroy?.();
          return;
        }
        // EMA 9/21/50/130 — identical set/colours to the SaxoAITrader chart modal
        (chart as any).__indicators = addEmaStack(chart, EMA_SET);
        chartRef.current = chart;
        setChartReady(true);
      } catch (e: any) {
        console.error('Vela mount failed', e);
        if (!cancelled) setError(e?.message ?? 'Failed to mount chart');
      }
    })();

    return () => {
      cancelled = true;
      try {
        chartRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, timeframe, mountKey]);

  // ── spot + expected moves (levels) ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLevelsLoading(true);
    fetchChartPayload(ticker, timeframe)
      .then((p) => {
        if (cancelled) return;
        setPayload({ spot: p.spot, expectedMoves: p.expectedMoves });
      })
      .catch(() => {
        if (!cancelled) setPayload({ spot: null, expectedMoves: [] });
      })
      .finally(() => {
        if (!cancelled) setLevelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker, timeframe]);

  // ── overlay EM lines whenever the chart or the data changes ───────────────
  useEffect(() => {
    if (!chartReady || !chartRef.current || !payload) return;
    clearOverlayLines(chartRef.current); // workspace-free, but keeps redraws idempotent
    if (showEm) drawExpectedMoves(chartRef.current, payload.spot, payload.expectedMoves);
  }, [chartReady, payload, showEm]);

  const spot = payload?.spot ?? null;
  const moves = payload?.expectedMoves ?? [];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 md:p-6"
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 12 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-border">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <span className="font-mono font-bold text-primary text-sm">{ticker}</span>
              </div>
              <div className="min-w-0">
                <h3 className="font-display font-semibold text-base leading-tight">{ticker}</h3>
                {companyName && (
                  <p className="text-xs text-muted-foreground truncate">{companyName}</p>
                )}
              </div>
              {spot != null && (
                <span className="font-mono text-lg font-bold ml-2">
                  {spot >= 1000 ? spot.toFixed(0) : spot.toFixed(2)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Timeframes */}
              <div className="inline-flex rounded-lg border border-border overflow-hidden">
                {TICKER_TIMEFRAMES.map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      timeframe === tf
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    {TIMEFRAME_LABELS[tf] ?? tf}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setShowEm((v) => !v)}
                title="Show expected-move levels (0.85 × ATM straddle, next 3 Fridays)"
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  showEm
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                Expected move
              </button>

              <button
                onClick={() => setMountKey((k) => k + 1)}
                title="Reload chart"
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
              </button>

              <button
                onClick={onClose}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Legend */}
          <div className="px-5 py-1.5 border-b border-border/50 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <LineChart className="w-3.5 h-3.5" />
              EMA
            </span>
            {EMA_SET.map((len, i) => (
              <span key={len} className="inline-flex items-center gap-1 font-mono">
                <span
                  className="inline-block w-3 h-0.5 rounded"
                  style={{ backgroundColor: EMA_COLORS[i % EMA_COLORS.length] }}
                />
                {len}
              </span>
            ))}
            {levelsLoading && <Loader2 className="w-3 h-3 animate-spin" />}
          </div>

          {/* Chart */}
          <div className="relative flex-1 min-h-[380px] bg-background">
            <div ref={hostRef} className="vela-chart-host absolute inset-0" />
            {error && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}
            {!chartReady && !error && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Loader2 className="w-7 h-7 text-primary animate-spin" />
              </div>
            )}
          </div>

          {/* Expected moves footer */}
          <div className="border-t border-border px-5 py-3">
            {moves.length > 0 ? (
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Expected move (0.85 × ATM straddle)
                </span>
                {moves.map((m) => (
                  <span key={m.expiry} className="inline-flex items-center gap-2 text-xs font-mono">
                    <span className="text-muted-foreground">{m.expiry.slice(5)}</span>
                    <span className="text-foreground/80">
                      ±{m.em.toFixed(2)}
                    </span>
                    <span className="text-red-400 inline-flex items-center gap-0.5">
                      <TrendingDown className="w-3 h-3" />
                      {m.lower.toFixed(2)}
                    </span>
                    <span className="text-success inline-flex items-center gap-0.5">
                      <TrendingUp className="w-3 h-3" />
                      {m.upper.toFixed(2)}
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {levelsLoading
                  ? 'Loading expected moves…'
                  : 'No options chain available for this ticker — expected moves unavailable.'}
              </p>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
