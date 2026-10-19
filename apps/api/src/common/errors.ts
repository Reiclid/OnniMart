/** Текст помилки для логів: зі стеком, щоб було видно, де саме впало */
export function errorText(error: unknown): string {
  return error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
}
