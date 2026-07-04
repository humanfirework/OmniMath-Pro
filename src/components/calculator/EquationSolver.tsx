'use client';

import React, { useState, useMemo } from 'react';
import { useCalculatorStore } from '@/lib/calculator/store';
import { evaluateExpression } from '@/lib/calculator/engine';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Equal, Play, Lightbulb, ArrowRight } from 'lucide-react';
import { FormulaRenderer } from './FormulaRenderer';
import { t } from '@/lib/calculator/i18n';

interface SolveExample {
  equation: string;
  variable: string;
  description: string;
}

const EXAMPLES: SolveExample[] = [
  { equation: 'x^2 - 5*x + 6', variable: 'x', description: 'x² − 5x + 6 = 0' },
  { equation: 'x^2 - 2*x - 8', variable: 'x', description: 'x² − 2x − 8 = 0' },
  { equation: 'x^3 - 6*x^2 + 11*x - 6', variable: 'x', description: 'x³ − 6x² + 11x − 6 = 0' },
  { equation: 'sin(x) - 0.5', variable: 'x', description: 'sin(x) = 0.5' },
  { equation: 'exp(x) - 3', variable: 'x', description: 'e^x = 3' },
  { equation: 'x^2 + x - 6', variable: 'x', description: 'x² + x − 6 = 0' },
];

export function EquationSolver() {
  const { theme, setEditorContent } = useCalculatorStore();
  const isDark = theme === 'dark';

  const [equation, setEquation] = useState('x^2 - 5*x + 6');
  const [variable, setVariable] = useState('x');
  const [result, setResult] = useState<string | null>(null);
  const [resultLatex, setResultLatex] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<string[]>([]);

  const solve = () => {
    if (!equation.trim()) {
      setError(t('solverEnterEquation'));
      setResult(null);
      setSteps([]);
      return;
    }

    // Build the solve command
    const cmd = `solve(${equation}, ${variable})`;
    const evalResult = evaluateExpression(cmd);

    if (evalResult.success && !evalResult.error) {
      setResult(evalResult.result);
      setResultLatex(evalResult.latex);
      setError(null);
      // Generate explanation steps
      const generatedSteps = generateSteps(equation, variable, evalResult.result);
      setSteps(generatedSteps);
    } else {
      setError(evalResult.error || 'Could not solve equation');
      setResult(null);
      setSteps([]);
    }
  };

  const generateSteps = (eq: string, varName: string, solution: string): string[] => {
    const steps: string[] = [];
    steps.push(`${t('solverStepSetup')}  ${eq} = 0`);
    steps.push(`${t('solverStepSolve')} ${varName}`);
    steps.push(`${t('solverStepSolution')}: ${solution}`);
    return steps;
  };

  const loadExample = (ex: SolveExample) => {
    setEquation(ex.equation);
    setVariable(ex.variable);
    setResult(null);
    setError(null);
    setSteps([]);
  };

  const insertIntoEditor = () => {
    if (result) {
      setEditorContent(`solve(${equation}, ${variable})`);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className={`px-3 py-2 text-[11px] uppercase tracking-wider font-medium border-b flex items-center justify-between ${
        isDark ? 'text-[#858585] border-[#3c3c3c]' : 'text-[#666] border-[#e0e0e0]'
      }`}>
        <span className="flex items-center gap-1.5">
          <Equal className={`h-3.5 w-3.5 ${isDark ? 'text-[#4fc3f7]' : 'text-[#007acc]'}`} />
          {t('solverTitle')}
        </span>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {/* Equation input */}
          <div>
            <label className={`text-[10px] uppercase tracking-wider mb-1 block ${
              isDark ? 'text-[#858585]' : 'text-[#888]'
            }`}>
              {t('solverEquationForm')}
            </label>
            <Input
              type="text"
              value={equation}
              onChange={e => setEquation(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && solve()}
              className={`h-8 font-mono text-[12px] ${
                isDark ? 'bg-[#2d2d2d] border-[#3c3c3c] text-[#cccccc]' : 'bg-white border-[#e0e0e0] text-[#333]'
              }`}
              placeholder="e.g. x^2 - 5*x + 6"
            />
          </div>

          {/* Variable input */}
          <div>
            <label className={`text-[10px] uppercase tracking-wider mb-1 block ${
              isDark ? 'text-[#858585]' : 'text-[#888]'
            }`}>
              {t('solverVariable')}
            </label>
            <Input
              type="text"
              value={variable}
              onChange={e => setVariable(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && solve()}
              className={`h-8 font-mono text-[12px] w-20 ${
                isDark ? 'bg-[#2d2d2d] border-[#3c3c3c] text-[#cccccc]' : 'bg-white border-[#e0e0e0] text-[#333]'
              }`}
              placeholder="x"
            />
          </div>

          {/* Solve button */}
          <Button
            onClick={solve}
            className={`w-full h-8 text-[12px] ${
              isDark
                ? 'bg-[#0e639c] hover:bg-[#1177bb] text-white'
                : 'bg-[#007acc] hover:bg-[#005a9e] text-white'
            }`}
          >
            <Play className="h-3 w-3 mr-1" />
            {t('solverSolve')}
          </Button>

          {/* Error */}
          {error && (
            <div className={`rounded-md p-2.5 border text-[12px] ${
              isDark ? 'bg-red-900/10 border-red-800/30 text-red-400' : 'bg-red-50 border-red-200 text-red-600'
            }`}>
              <span className="font-medium">✕ {t('solverError')}:</span> {error}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className={`rounded-md p-3 border ${
              isDark ? 'bg-[#1a2332] border-[#2a4a6a]/30' : 'bg-[#f0f7ff] border-[#cce4f7]'
            }`}>
              <div className={`text-[10px] uppercase tracking-wider mb-2 ${
                isDark ? 'text-[#5a5a5a]' : 'text-[#aaa]'
              }`}>
                {t('solverSolution')}
              </div>
              {resultLatex ? (
                <FormulaRenderer expression={resultLatex} displayMode={true} />
              ) : (
                <div className={`font-mono text-[14px] ${
                  isDark ? 'text-[#4fc3f7]' : 'text-[#007acc]'
                }`}>
                  {result}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={insertIntoEditor}
                className={`w-full mt-2 h-6 text-[10px] ${
                  isDark
                    ? 'bg-[#2d2d2d] border-[#3c3c3c] text-[#cccccc] hover:bg-[#2a2d2e]'
                    : 'bg-white border-[#e0e0e0] text-[#333] hover:bg-[#f0f0f0]'
                }`}
              >
                {t('solverInsert')}
                <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          )}

          {/* Steps */}
          {steps.length > 0 && (
            <div>
              <div className={`text-[10px] uppercase tracking-wider mb-2 flex items-center gap-1 ${
                isDark ? 'text-[#858585]' : 'text-[#888]'
              }`}>
                <Lightbulb className="h-3 w-3" />
                {t('solverSteps')}
              </div>
              <div className="space-y-1.5">
                {steps.map((step, i) => (
                  <div
                    key={i}
                    className={`rounded p-2 text-[11px] font-mono border ${
                      isDark ? 'bg-[#2d2d2d] border-[#3c3c3c] text-[#cccccc]' : 'bg-[#fafafa] border-[#e0e0e0] text-[#333]'
                    }`}
                  >
                    <span className={`mr-2 ${isDark ? 'text-[#4fc3f7]' : 'text-[#007acc]'}`}>
                      {i + 1}.
                    </span>
                    {step}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Examples */}
          <div>
            <div className={`text-[10px] uppercase tracking-wider mb-2 ${
              isDark ? 'text-[#858585]' : 'text-[#888]'
            }`}>
              {t('solverExamples')}
            </div>
            <div className="space-y-1">
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => loadExample(ex)}
                  className={`w-full text-left p-2 rounded text-[11px] transition-colors border ${
                    isDark
                      ? 'bg-[#2d2d2d] hover:bg-[#2a2d2e] border-[#3c3c3c] hover:border-[#094771]'
                      : 'bg-white hover:bg-[#f5f9fc] border-[#e0e0e0] hover:border-[#094771]'
                  }`}
                >
                  <div className={`font-mono ${
                    isDark ? 'text-[#9cdcfe]' : 'text-[#007acc]'
                  }`}>
                    {ex.equation}
                  </div>
                  <div className={`mt-0.5 text-[10px] ${
                    isDark ? 'text-[#858585]' : 'text-[#888]'
                  }`}>
                    {ex.description}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
