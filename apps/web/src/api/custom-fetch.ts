import { cookies } from "next/headers";

/** httpOnly-cookie з токеном сесії покупця (ставлять серверні дії входу) */
export const SESSION_COOKIE = "onnimart_session";

/** Вхід і власні дані покупця — токен сесії; решта змін — токен адміністратора */
const USER_ROUTE = /^\/api\/v1\/(auth|me)(\/|$)/;

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
  // Запити йдуть із сервера Next.js (серверні компоненти й дії) — адреса й токени з оточення
  const token = USER_ROUTE.test(url)
    ? (await cookies()).get(SESSION_COOKIE)?.value
    : process.env.ADMIN_TOKEN;
  const response = await fetch(
    `${process.env.API_URL ?? "http://localhost:3001"}${url}`,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
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
