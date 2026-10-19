import { errorText } from '../../../common/errors';
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { MATCHING_REQUESTS_QUEUE } from '@repo/contracts';
import { createRedis } from '../../../redis';
import { MatchingService } from './matching.service';

/** Воркер: запити API на зіставлення (кнопка, рішення модератора) → пакетний прохід */
@Injectable()
export class MatchingRequestsWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(MatchingRequestsWorker.name);
  // Окреме з'єднання: BRPOP блокує його
  private readonly redis = createRedis({ maxRetriesPerRequest: null });
  private running = false;
  private loop?: Promise<void>;

  constructor(private readonly matching: MatchingService) {}

  onApplicationBootstrap() {
    this.running = true;
    this.loop = this.run();
  }

  async onApplicationShutdown() {
    this.running = false;
    this.redis.disconnect();
    await this.loop;
  }

  private async run() {
    while (this.running) {
      try {
        if (await this.redis.brpop(MATCHING_REQUESTS_QUEUE, 5)) {
          this.matching.schedule();
        }
      } catch (error) {
        if (!this.running) break;
        this.logger.error(`Черга запитів зіставлення: ${errorText(error)}`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }
}
