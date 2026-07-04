'use client';

import { useCallback, useMemo } from 'react';
import { BookOpen } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GUIDE_SECTIONS } from '@/lib/calculator/engine';
import { useCalculatorStore } from '@/lib/calculator/store';

/** A single parsed line from a guide section's content */
interface ParsedLine {
  type: 'description' | 'code';
  text: string;
  /** The raw text without leading whitespace (for code insertion) */
  code?: string;
}

function parseContent(content: string): ParsedLine[] {
  return content.split('\n').map((line) => {
    const codeMatch = line.match(/^( {2,})(.+)$/);
    if (codeMatch) {
      return {
        type: 'code',
        text: codeMatch[2],
        code: codeMatch[2].trim(),
      };
    }
    return {
      type: 'description',
      text: line,
    };
  });
}

export function GuidePanel() {
  const setEditorContent = useCalculatorStore((s) => s.setEditorContent);
  const theme = useCalculatorStore((s) => s.theme);
  const isDark = theme === 'dark';

  const parsedSections = useMemo(
    () =>
      GUIDE_SECTIONS.map((section, idx) => ({
        id: `guide-section-${idx}`,
        title: section.title,
        lines: parseContent(section.content),
      })),
    []
  );

  const handleCodeClick = useCallback(
    (code: string) => {
      setEditorContent(code);
    },
    [setEditorContent]
  );

  return (
    <ScrollArea className="h-full">
      <div className="px-3 py-2">
        <Accordion
          type="multiple"
          defaultValue={['guide-section-0']}
          className="w-full space-y-1"
        >
          {parsedSections.map((section) => (
            <AccordionItem
              key={section.id}
              value={section.id}
              className={`rounded-md border px-1 ${
                isDark ? 'border-[#3c3c3c]' : 'border-[#e0e0e0]'
              }`}
            >
              <AccordionTrigger className={`py-2.5 text-[13px] font-medium hover:no-underline ${
                isDark ? 'text-zinc-300 hover:text-zinc-100' : 'text-[#555] hover:text-[#222]'
              }`}>
                <span className="flex items-center gap-2">
                  <BookOpen className={`h-3.5 w-3.5 ${isDark ? 'text-emerald-400/80' : 'text-emerald-600'}`} />
                  <span>{section.title}</span>
                </span>
              </AccordionTrigger>

              <AccordionContent className={`text-[12px] leading-relaxed ${
                isDark ? 'text-zinc-400' : 'text-[#666]'
              }`}>
                <div className="space-y-1.5 pb-1">
                  {section.lines.map((line, lineIdx) => {
                    if (line.type === 'code') {
                      const prevLine = lineIdx > 0 ? section.lines[lineIdx - 1] : null;
                      const nextLine = lineIdx < section.lines.length - 1 ? section.lines[lineIdx + 1] : null;
                      const isBlockStart = prevLine?.type !== 'code';

                      if (!isBlockStart) {
                        return null;
                      }

                      const blockLines: ParsedLine[] = [];
                      for (let i = lineIdx; i < section.lines.length; i++) {
                        if (section.lines[i].type !== 'code') break;
                        blockLines.push(section.lines[i]);
                      }

                      return (
                        <div
                          key={`code-block-${lineIdx}`}
                          className={`rounded-md overflow-hidden border ${
                            isDark ? 'bg-[#1a1a2e] border-[#2a2a4e]' : 'bg-[#f5f7fa] border-[#e0e0e0]'
                          }`}
                        >
                          {blockLines.map((bLine, bIdx) => (
                            <button
                              key={`code-line-${lineIdx}-${bIdx}`}
                              type="button"
                              onClick={() => handleCodeClick(bLine.code!)}
                              className={`flex w-full items-center gap-2 px-3 py-1 text-left font-mono text-[12px] transition-colors duration-150 cursor-pointer ${
                                isDark
                                  ? 'text-emerald-300/90 hover:bg-white/[0.04] hover:text-emerald-200'
                                  : 'text-[#007acc] hover:bg-[#e5f1fb] hover:text-[#005a9e]'
                              }`}
                              title={`Click to insert: ${bLine.code}`}
                            >
                              <span className={`select-none ${
                                isDark ? 'text-zinc-600' : 'text-[#bbb]'
                              }`}>
                                {String(lineIdx + bIdx + 1).padStart(2, ' ')}
                              </span>
                              <span className="flex-1">{bLine.text}</span>
                            </button>
                          ))}
                        </div>
                      );
                    }

                    if (line.text.trim() === '') {
                      return (
                        <div
                          key={`empty-${lineIdx}`}
                          className="h-2"
                        />
                      );
                    }

                    return (
                      <p
                        key={`desc-${lineIdx}`}
                        className={`px-1 ${isDark ? 'text-zinc-400' : 'text-[#666]'}`}
                      >
                        {line.text}
                      </p>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </ScrollArea>
  );
}
