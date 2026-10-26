import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, User } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  hashPassword,
  newSessionToken,
  sessionTokenHash,
  verifyPassword,
} from '../../auth/password';
import type {
  LoginDto,
  RegisterDto,
  SessionDto,
  UpdateMeDto,
  UserDto,
} from './dto/accounts.dto';

const SESSION_DAYS = 30;

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    countryCode: user.countryCode,
    currencyCode: user.currencyCode,
    notifyPush: user.notifyPush,
    notifyEmail: user.notifyEmail,
    minDiscount: user.minDiscount,
    chainIds: user.chainIds,
    interests: user.interests ?? [],
    telemetryConsent: user.telemetryConsentAt !== null,
    createdAt: user.createdAt.toISOString(),
  };
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** Облікові записи: реєстрація, вхід за паролем, сесії, профіль і налаштування */
@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterDto): Promise<SessionDto> {
    try {
      const user = await this.prisma.user.create({
        data: {
          email: normalizeEmail(dto.email),
          name: dto.name?.trim() || null,
          passwordHash: await hashPassword(dto.password),
          countryCode: 'UA',
        },
      });
      return this.startSession(user);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Користувач з таким email уже є');
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<SessionDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(dto.email) },
    });
    // Однакова відповідь для невідомого email і неправильного пароля
    if (!(await verifyPassword(dto.password, user?.passwordHash)) || !user) {
      throw new UnauthorizedException('Невірний email або пароль');
    }
    await this.prisma.session.deleteMany({
      where: { userId: user.id, expiresAt: { lte: new Date() } },
    });
    return this.startSession(user);
  }

  async logout(token: string): Promise<void> {
    if (!token) return;
    await this.prisma.session.deleteMany({
      where: { tokenHash: sessionTokenHash(token) },
    });
  }

  async me(userId: string): Promise<UserDto> {
    return toUserDto(
      await this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    );
  }

  async update(userId: string, dto: UpdateMeDto): Promise<UserDto> {
    const { telemetryConsent, ...fields } = dto;
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { telemetryConsentAt: true },
    });
    const [user] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          ...fields,
          ...(dto.name !== undefined && { name: dto.name.trim() || null }),
          // Повторне "так" не зсуває дату першої згоди
          ...(telemetryConsent !== undefined && {
            telemetryConsentAt: telemetryConsent
              ? (current.telemetryConsentAt ?? new Date())
              : null,
          }),
        },
      }),
      // Відкликана згода — зібрані події видаляються
      ...(telemetryConsent === false
        ? [this.prisma.event.deleteMany({ where: { userId } })]
        : []),
    ]);
    return toUserDto(user);
  }

  /** Сесії, підписки, сповіщення, перегляди й події видаляються каскадом */
  async remove(userId: string): Promise<void> {
    await this.prisma.user.delete({ where: { id: userId } });
  }

  private async startSession(user: User): Promise<SessionDto> {
    const token = newSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.session.create({
      data: { userId: user.id, tokenHash: sessionTokenHash(token), expiresAt },
    });
    return { token, expiresAt: expiresAt.toISOString(), user: toUserDto(user) };
  }
}
