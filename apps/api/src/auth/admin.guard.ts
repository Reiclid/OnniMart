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

/**
 * Читання каталогу публічне, а будь-яка зміна (запуск парсингу, модерація) —
 * лише з `Authorization: Bearer <ADMIN_TOKEN>`.
 * shortcut: один токен адміністратора; користувачі й ролі (JWT) — коли зʼявляться акаунти.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (READ_ONLY.has(request.method)) return true;

    const expected = process.env.ADMIN_TOKEN;
    if (!expected) {
      throw new ServiceUnavailableException(
        'ADMIN_TOKEN не задано — зміни через API вимкнено',
      );
    }
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!sameSecret(token, expected)) {
      throw new UnauthorizedException('Потрібен токен адміністратора');
    }
    return true;
  }
}

/** Порівняння без витоку довжини збігу через час відповіді */
function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
