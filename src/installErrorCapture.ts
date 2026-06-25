/**
 * Fängt die Fehler ab, die react-pdf intern via console.error loggt.
 *
 * WARUM ein eigenes Modul, das als ALLERERSTES importiert werden muss:
 * react-pdfs Reconciler greift beim Import eine eigene Referenz auf
 * console.error ab (`S=console.error`). Wenn eine Layout-Komponente wirft,
 * fängt react-pdf den Fehler intern ab, loggt ihn über DIESE Referenz (inkl.
 * dem entscheidenden componentStack) und scheitert danach mit einem
 * nichtssagenden Folgefehler ("Cannot read properties of null"). Der echte
 * Fehler steckt also nur im console.error-Log.
 *
 * Würden wir console.error erst zur Laufzeit überschreiben, hätte der
 * Reconciler längst die Original-Referenz eingefangen. Indem wir HIER – vor dem
 * ersten react-pdf-Import – überschreiben, fängt er stattdessen unsere Variante
 * ein. Deshalb importiert troubleshoot.ts dieses Modul vor allem anderen.
 */
export const ORIGINAL_CONSOLE_ERROR: (...args: unknown[]) => void = console.error.bind(console);

export const capturedErrors: Error[] = [];
export const capturedRaw: string[] = [];

let capturing = false;

export function startCapture(): void {
  capturing = true;
  capturedErrors.length = 0;
  capturedRaw.length = 0;
}

export function stopCapture(): void {
  capturing = false;
}

console.error = (...args: unknown[]): void => {
  if (!capturing) {
    ORIGINAL_CONSOLE_ERROR(...args);
    return;
  }
  for (const a of args) if (a instanceof Error) capturedErrors.push(a);
  capturedRaw.push(args.map((a) => (a instanceof Error ? a.stack ?? a.message : String(a))).join(' '));
};
