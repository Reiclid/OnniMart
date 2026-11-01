import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import webpush, { WebPushError } from 'web-push';
import { withFields } from '../../logger';
import { PrismaService } from '../../prisma/prisma.service';
import type { DeviceDto, SaveDeviceDto } from './dto/push.dto';
import { isGone, isPushEndpoint, type PushMessage } from './push';

/** Скільки push-сервіс тримає сповіщення для вимкненого телефона: ціна за добу вже застаріла */
const TTL_SECONDS = 24 * 60 * 60;

/**
 * Web Push (VAPID): пристрої покупця й відправка. Працює і в API (тестове сповіщення),
 * і у воркері (AlertsChecker). Без VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY push вимкнено.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  readonly publicKey: string | null;

  constructor(private readonly prisma: PrismaService) {
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
    this.publicKey =
      VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY ? VAPID_PUBLIC_KEY : null;
    if (this.publicKey) {
      webpush.setVapidDetails(
        VAPID_SUBJECT || 'mailto:onnimart@localhost',
        this.publicKey,
        VAPID_PRIVATE_KEY!,
      );
    }
  }

  async devices(userId: string): Promise<DeviceDto[]> {
    const rows = await this.prisma.pushDevice.findMany({
      where: { userId, endpoint: { not: null } },
      orderBy: { lastSeenAt: 'desc' },
    });
    return rows.map((d) => ({
      id: d.id,
      endpoint: d.endpoint!,
      label: d.label,
      createdAt: d.createdAt.toISOString(),
      lastSeenAt: d.lastSeenAt.toISOString(),
    }));
  }

  /** Той самий браузер (endpoint) після входу в інший акаунт переходить до нього */
  async save(userId: string, dto: SaveDeviceDto): Promise<DeviceDto> {
    if (!isPushEndpoint(dto.endpoint)) {
      throw new BadRequestException('Невідомий push-сервіс');
    }
    const data = {
      userId,
      p256dh: dto.p256dh,
      auth: dto.auth,
      label: dto.label ?? null,
      platform: 'web',
      lastSeenAt: new Date(),
    };
    const [device] = await this.prisma.$transaction([
      this.prisma.pushDevice.upsert({
        where: { endpoint: dto.endpoint },
        create: { ...data, endpoint: dto.endpoint },
        update: data,
      }),
      // Увімкнув push на пристрої — отже хоче push (старий загальний перемикач)
      this.prisma.user.update({
        where: { id: userId },
        data: { notifyPush: true },
      }),
    ]);
    return {
      id: device.id,
      endpoint: dto.endpoint,
      label: device.label,
      createdAt: device.createdAt.toISOString(),
      lastSeenAt: device.lastSeenAt.toISOString(),
    };
  }

  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.pushDevice.deleteMany({
      where: { id, userId },
    });
    if (count === 0) throw new NotFoundException('Пристрій не знайдено');
  }

  /** Сповіщення на всі браузери покупця (або один endpoint); повертає, скільки прийняли */
  async send(
    userId: string,
    message: PushMessage,
    endpoint?: string,
  ): Promise<number> {
    if (!this.publicKey) return 0;
    const devices = await this.prisma.pushDevice.findMany({
      where: { userId, endpoint: endpoint ?? { not: null } },
    });
    const payload = JSON.stringify(message);
    const results = await Promise.all(
      devices.map(async (d) => {
        if (!d.endpoint || !d.p256dh || !d.auth || !isPushEndpoint(d.endpoint))
          return false;
        try {
          await webpush.sendNotification(
            { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
            payload,
            { TTL: TTL_SECONDS, timeout: 10_000 },
          );
          return true;
        } catch (error) {
          const status =
            error instanceof WebPushError ? error.statusCode : undefined;
          if (isGone(status)) {
            await this.prisma.pushDevice.deleteMany({ where: { id: d.id } });
          } else {
            this.logger.warn(
              withFields('Push не надіслано', {
                device: d.id,
                status,
                error: (error as Error).message,
              }),
            );
          }
          return false;
        }
      }),
    );
    return results.filter(Boolean).length;
  }
}
