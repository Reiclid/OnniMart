import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ApiError, SESSION_COOKIE } from '@/api/custom-fetch';
import { getMe } from '@/api/generated/me/me';
import type { UserDto } from '@/api/generated/model';

/** Покупець поточного запиту або null (немає cookie чи сесія закінчилась) */
export async function currentUser(): Promise<UserDto | null> {
  if (!(await cookies()).has(SESSION_COOKIE)) return null;
  try {
    return (await getMe()).data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

/** Для сторінок, де без входу нема чого показати */
export async function requireUser(next: string): Promise<UserDto> {
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}
