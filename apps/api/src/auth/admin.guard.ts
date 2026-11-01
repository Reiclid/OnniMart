import { timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

const READ_ONLY = new Set(['GET', 'HEAD', 'OPTIONS']);
/** Вхід і власні дані користувача — свій захист (UserGuard), не токен адміністратора */
const USER_ROUTES = /^\/api\/v1\/(auth|me)(\/|$)/;

/**
 * Читання каталогу публічне, а будь-яка зміна (запуск парсингу, модерація) —
 * лише з `Authorization: Bearer <ADMIN_TOKEN>`.
 * shortcut: один токен адміністратора; користувачі й ролі (JWT) — коли зʼявляться акаунти.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (READ_ONLY.has(request.method) || USER_ROUTES.test(request.path ?? ''))
      return true;

    const expected = process.env.ADMIN_TOKEN;
    if (!expected) {
      throw new ServiceUnavailableException(
        'ADMIN_TOKEN не задано — зміни через API вимкнено',
      );
    }
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!isAdminToken(token)) {
      throw new UnauthorizedException('Потрібен токен адміністратора');
    }
    return true;
  }
}

/** Чи це ADMIN_TOKEN; порівняння без витоку довжини збігу через час відповіді */
export function isAdminToken(token: string): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  const left = Buffer.from(token);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Адмінку відкриває лише один акаунт: ADMIN_EMAIL, який входить тільки через Google.
 * Акаунт з паролем не підходить — пароль до чужого email міг задати будь-хто ще до
 * власника, і він лишився б дійсним після прив'язки Google.
 */
export function isAdminUser(user: {
  email: string;
  googleSub: string | null;
  passwordHash: string | null;
}): boolean {
  const admin = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  return (
    !!admin &&
    user.email === admin &&
    user.googleSub !== null &&
    user.passwordHash === null
  );
}

/** Email адміністратора не можна зайняти паролем: лише вхід через Google */
export function isAdminEmail(email: string): boolean {
  const admin = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  return !!admin && email === admin;
}
