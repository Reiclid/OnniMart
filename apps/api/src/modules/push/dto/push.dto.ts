import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** PushSubscription браузера (subscription.toJSON()) + назва пристрою */
export class SaveDeviceDto {
  @ApiProperty({ description: 'Адреса push-сервісу браузера (HTTPS)' })
  @IsString()
  @MaxLength(1000)
  endpoint!: string;

  @ApiProperty({ description: 'keys.p256dh (base64url)' })
  @Matches(/^[A-Za-z0-9_-]{40,200}$/)
  p256dh!: string;

  @ApiProperty({ description: 'keys.auth (base64url)' })
  @Matches(/^[A-Za-z0-9_-]{10,100}$/)
  auth!: string;

  @ApiPropertyOptional({ example: 'Chrome · Android' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;
}

export class TestPushDto {
  @ApiProperty({ description: 'Заголовок мовою покупця (текст дає веб)' })
  @IsString()
  @MaxLength(100)
  title!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  body!: string;

  @ApiPropertyOptional({
    description: 'Лише на цей пристрій; без нього — на всі пристрої покупця',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  endpoint?: string;
}

export class DeviceDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Щоб браузер упізнав себе серед пристроїв' })
  endpoint!: string;
  @ApiProperty({ type: String, nullable: true }) label!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() lastSeenAt!: string;
}

export class PushKeyDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Публічний VAPID-ключ для pushManager.subscribe; null — push вимкнено',
  })
  publicKey!: string | null;
}

export class PushSentDto {
  @ApiProperty({ description: 'Скільки пристроїв прийняли сповіщення' })
  sent!: number;
}
