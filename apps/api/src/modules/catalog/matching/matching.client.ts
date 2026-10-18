import { Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  MATCHING_REQUESTS_QUEUE,
  MATCHING_STATE_KEY,
  MatchingState,
} from '@repo/contracts';
import { createRedis } from '../../../redis';

/** API-сторона зіставлення: просить воркер запустити пакет і читає його стан */
@Injectable()
export class MatchingClient implements OnModuleDestroy {
  private readonly redis = createRedis();

  onModuleDestroy() {
    this.redis.disconnect();
  }

  /** Воркер об'єднує запити, що прийшли під час пакета, в один наступний прохід */
  async request(): Promise<void> {
    await this.redis.lpush(MATCHING_REQUESTS_QUEUE, new Date().toISOString());
  }

  async state(): Promise<MatchingState> {
    const raw = await this.redis.get(MATCHING_STATE_KEY);
    return raw
      ? (JSON.parse(raw) as MatchingState)
      : { running: false, lastReport: null, updatedAt: '' };
  }
}
