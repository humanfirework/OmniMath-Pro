/**
 * Type declarations for the algebrite library (no bundled types).
 * Algebrite exposes a static API on its default export.
 */

declare module 'algebrite' {
  export interface AlgebriteStatic {
    /**
     * Run an Algebrite script/command and return the result as a string.
     * Example: Algebrite.run('integral(x^2, x)') → 'x^3/3'
     *          Algebrite.run('printlatex(integral(x^2, x))') → '\\frac{x^{3}}{3}'
     */
    run(command: string): string;

    /**
     * Evaluate a single expression with optional variable bindings.
     */
    eval(expr: string, ...values: Array<string | number>): string;

    /**
     * Simplify an expression.
     */
    simplify(expr: string): string;

    /**
     * Get the LaTeX representation of an expression.
     */
    printlatex(expr: string): string;

    /**
     * Other commonly used functions — all accept the same string-command API.
     */
    derivative(expr: string, varName: string): string;
    integral(expr: string, varName: string): string;
    taylor(expr: string, varName: string, order: number, point?: number): string;
    roots(expr: string, varName: string): string;

    /**
     * Version string.
     */
    version: string;
  }

  const Algebrite: AlgebriteStatic;
  export default Algebrite;
}
