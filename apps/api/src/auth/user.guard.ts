import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { sessionTokenHash } from './password';

type UserRequest = Request & { userId?: string };

export function bearerToken(request: Request): string {
  const header = request.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

/** Маршрути /api/v1/me/*: `Authorization: Bearer <токен сесії>` → request.userId */
@Injectable()
export class UserGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<UserRequest>();
    const token = bearerToken(request);
    const session = token
      ? await this.prisma.session.findUnique({
          where: { tokenHash: sessionTokenHash(token) },
          select: { userId: true, expiresAt: true },
        })
      : null;
    if (!session || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Потрібно увійти');
    }
    request.userId = session.userId;
    return true;
  }
}

/** id користувача, якого впустив UserGuard */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<UserRequest>().userId!,
);
