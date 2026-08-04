'use client';

/**
 * OmniMath Pro — Global Calc Bar (Alt+Space)
 *
 * A floating input bar (top-center, glass, animated entrance) triggered by
 * Alt+Space. Type any expression, Enter → evaluate → show result in a
 * dropdown below + copy. Esc to close. Persists last few quick calcs.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sigma, X, ArrowRight, Check, Copy, AlertCircle } from 'lucide-react';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { evaluateExpression } from '@/lib/engine';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface QuickCalc {
  id: string;
  input: string;
  output: string;
  error?: string;
  ts: number;
}

const STORAGE_KEY = 'omnimath-quick-calcs';

function loadQuickCalcs(): QuickCalc[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveQuickCalcs(items: QuickCalc[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 8)));
  } catch {
    /* ignore */
  }
}

export function GlobalCalcBar() {
  const open = useWorkbenchStore((s) => s.globalCalcOpen);
  const setOpen = useWorkbenchStore((s) => s.setGlobalCalcOpen);
  const inputMode = useWorkbenchStore((s) => s.inputMode);
  const addResult = useWorkbenchStore((s) => s.addResult);

  const [value, setValue] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<QuickCalc[]>(() => loadQuickCalcs());
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Centralized "open calc bar" — clears input and focuses the field.
  const openCalcBar = useCallback(() => {
    setValue('');
    setResult(null);
    setError(null);
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [setOpen]);

  // Alt+Space global hotkey
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.code === 'Space') {
        e.preventDefault();
        if (!open) openCalcBar();
        else setOpen(false);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, setOpen, openCalcBar]);

  // Focus the input whenever the bar opens (focus only — no setState for value).
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  const run = useCallback(() => {
    if (!value.trim()) return;
    const r = evaluateExpression(value, inputMode);
    if (r.success) {
      setResult(r.result);
      setError(null);
      addResult({
        id: `qc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        input: value,
        output: r.result,
        latex: r.latex || '',
        timestamp: Date.now(),
        type: r.type,
        isMatrix: r.isMatrix,
        matrix: r.matrix,
      });
      const newEntry: QuickCalc = {
        id: `q-${Date.now()}`,
        input: value,
        output: r.result,
        ts: Date.now(),
      };
      const next = [newEntry, ...history.filter((h) => h.input !== value)].slice(0, 8);
      setHistory(next);
      saveQuickCalcs(next);
    } else {
      setResult(null);
      setError(r.error ?? 'Error');
    }
  }, [value, inputMode, addResult, history]);

  const handleCopy = useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  }, [result]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-start justify-center pt-[12vh] px-4"
          onClick={() => setOpen(false)}
        >
          {/* Backdrop blur */}
          <div className="absolute inset-0 bg-background/40 backdrop-blur-sm" />

          {/* Card */}
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 280, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-[560px] glass-strong rounded-xl border border-border shadow-2xl overflow-hidden"
            style={{ boxShadow: '0 0 0 1px oklch(0.7 0.15 165 / 25%), 0 12px 40px rgba(0,0,0,0.18)' }}
          >
            {/* Input row */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/60">
              <div className="grid place-items-center size-6 rounded-md bg-primary/10 border border-primary/30">
                <Sigma className="size-3.5 text-primary" />
              </div>
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') run();
                  if (e.key === 'Escape') setOpen(false);
                }}
                placeholder={t('qcPlaceholder')}
                className="flex-1 bg-transparent outline-none text-[13px] font-mono text-foreground placeholder:text-muted-foreground/60"
                spellCheck={false}
              />
              <kbd className="text-[10px] text-muted-foreground font-mono px-1.5 py-0.5 rounded border border-border/60 bg-muted/40">
                ⏎
              </kbd>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid place-items-center size-6 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Close"
              >
                <X className="size-3.5" />
              </button>
            </div>

            {/* Result */}
            <AnimatePresence>
              {result && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-3 py-2.5 border-b border-border/60 bg-primary/5"
                >
                  <div className="flex items-center gap-2">
                    <ArrowRight className="size-3.5 text-primary shrink-0" />
                    <code className="flex-1 font-mono text-[13px] text-foreground break-all">
                      {result}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="grid place-items-center size-6 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                      aria-label={t('previewCopy')}
                    >
                      {copied ? (
                        <Check className="size-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </button>
                  </div>
                </motion.div>
              )}
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-3 py-2.5 border-b border-border/60 bg-destructive/8"
                >
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="size-3.5 shrink-0" />
                    <span className="text-[12px] font-mono break-all">{error}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* History */}
            {history.length > 0 && (
              <div className="max-h-[200px] overflow-y-auto">
                <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t('histTitle')}
                </div>
                {history.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => {
                      setValue(h.input);
                      setResult(h.output);
                      setError(null);
                      inputRef.current?.focus();
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-accent/40 transition-colors flex items-center gap-2"
                  >
                    <code className="flex-1 text-[11.5px] font-mono text-primary/90 truncate">
                      {h.input}
                    </code>
                    <ArrowRight className="size-3 text-muted-foreground shrink-0" />
                    <code className="flex-1 text-[11.5px] font-mono text-foreground/80 truncate">
                      {h.output}
                    </code>
                  </button>
                ))}
              </div>
            )}

            {/* Footer */}
            <div className="px-3 py-1.5 border-t border-border/60 text-[10px] text-muted-foreground flex items-center justify-between">
              <span className="font-mono">Alt+Space {t('commonClose')}</span>
              <span className="font-mono">↵ {t('commonRun')}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
