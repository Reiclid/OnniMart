/** Помилка API зі статусом — щоб сторінки відрізняли 404 від інших збоїв */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const customFetch = async <T>(
  url: string,
  options: RequestInit,
): Promise<T> => {
  // Запити йдуть із сервера Next.js (серверні компоненти й дії) — адреса з оточення
  const response = await fetch(
    `${process.env.API_URL ?? "http://localhost:3001"}${url}`,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
        // Лише на сервері Next.js (серверні дії): у браузері змінної немає
        ...(process.env.ADMIN_TOKEN && {
          Authorization: `Bearer ${process.env.ADMIN_TOKEN}`,
        }),
        ...options.headers,
      },
    },
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = Array.isArray(data.message)
      ? data.message.join("; ")
      : data.message;
    throw new ApiError(
      response.status,
      message || `Помилка сервера: ${response.status}`,
    );
  }

  return {
    data,
    status: response.status,
    headers: response.headers,
  } as T;
};
