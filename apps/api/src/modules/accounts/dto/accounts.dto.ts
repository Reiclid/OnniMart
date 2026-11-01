import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'olena@example.com' })
  @IsEmail({}, { message: 'Некоректний email' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Пароль — щонайменше 8 символів' })
  @MaxLength(200)
  password!: string;
}

export class RegisterDto extends LoginDto {
  @ApiPropertyOptional({ example: 'Olena' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}

export class GoogleLoginDto {
  @ApiProperty({ description: 'code з адреси повернення Google' })
  @IsString()
  @MaxLength(2000)
  code!: string;

  @ApiProperty({
    description: 'PKCE code_verifier (RFC 7636: 43–128 символів)',
  })
  @Matches(/^[A-Za-z0-9._~-]{43,128}$/)
  codeVerifier!: string;

  @ApiProperty({
    description: 'redirect_uri, з яким веб відправив покупця на Google',
  })
  @IsString()
  @MaxLength(500)
  redirectUri!: string;

  @ApiProperty({
    description: 'nonce із запиту на Google — має повернутися в ID-токені',
  })
  @IsString()
  @MaxLength(200)
  nonce!: string;
}

export class UserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ type: String, nullable: true }) name!: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'UA' })
  countryCode!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'USD',
    description: 'Валюта показу цін; null — валюта країни',
  })
  currencyCode!: string | null;
  @ApiProperty() notifyPush!: boolean;
  @ApiProperty() notifyEmail!: boolean;
  @ApiProperty({ description: 'Лише знижки від N %' }) minDiscount!: number;
  @ApiProperty({
    type: [String],
    description: 'Улюблені мережі (StoreChain.id)',
  })
  chainIds!: string[];
  @ApiProperty({
    type: [String],
    description: 'Категорії з онбордингу (Category.slug) — першими в «Для вас»',
  })
  interests!: string[];
  @ApiProperty({ description: 'Згода на збір подій для рекомендацій' })
  telemetryConsent!: boolean;
  @ApiProperty({
    description: 'Адміністратор (ADMIN_EMAIL, вхід лише через Google)',
  })
  admin!: boolean;
  @ApiProperty() createdAt!: string;
}

export class SessionDto {
  @ApiProperty({ description: 'Токен сесії: `Authorization: Bearer <token>`' })
  token!: string;
  @ApiProperty() expiresAt!: string;
  @ApiProperty({ type: UserDto }) user!: UserDto;
}

export class GoogleSessionDto extends SessionDto {
  @ApiProperty({
    description: 'Акаунт щойно створено (перший вхід через Google)',
  })
  created!: boolean;
}

export class UpdateMeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'UA' })
  @IsOptional()
  @Matches(/^[A-Z]{2}$/, { message: 'Код країни ISO: UA, DE…' })
  countryCode?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'USD',
    description: 'Валюта показу цін; null — валюта країни',
  })
  @ValidateIf((_o, value) => value !== null && value !== undefined)
  @Matches(/^[A-Z]{3}$/, { message: 'Код валюти ISO 4217: UAH, EUR, USD…' })
  currencyCode?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() notifyPush?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() notifyEmail?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 90 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(90)
  minDiscount?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  chainIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Category.slug' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @Matches(/^[a-z0-9-]{2,40}$/, {
    each: true,
    message: 'slug категорії: a-z, 0-9, дефіс',
  })
  interests?: string[];

  @ApiPropertyOptional({
    description: 'Згода на збір подій; false — відкликати й видалити зібрані',
  })
  @IsOptional()
  @IsBoolean()
  telemetryConsent?: boolean;
}

export class LowestPriceDto {
  @ApiProperty() price!: number;
  @ApiProperty() currency!: string;
  @ApiProperty() chainName!: string;
}

export class SubscriptionDto {
  @ApiProperty() id!: string;
  @ApiProperty() productId!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Конкретне фасування; null — будь-яке',
  })
  variantId!: string | null;
  @ApiProperty({ example: 'Напій газований Coca-Cola · 1,25 л' })
  title!: string;
  @ApiProperty({ type: String, nullable: true }) imageUrl!: string | null;
  @ApiProperty({ type: Number, nullable: true }) targetPrice!: number | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Валюта targetPrice; null — стара підписка (гривня, якщо є)',
  })
  currency!: string | null;
  @ApiProperty() notifyOnPromo!: boolean;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: [String] }) chainIds!: string[];
  @ApiProperty({ type: LowestPriceDto, nullable: true })
  lowest!: LowestPriceDto | null;
  @ApiProperty() createdAt!: string;
}

export class CreateSubscriptionDto {
  @ApiPropertyOptional({ description: 'Будь-яке фасування товару' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ description: 'Конкретне фасування' })
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Повідомити, коли ціна ≤ цієї суми',
  })
  @ValidateIf((_o, value) => value !== null && value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000)
  targetPrice?: number | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'USD',
    description:
      'Валюта targetPrice (зазвичай валюта показу); ціни інших валют перераховуються за курсом',
  })
  @ValidateIf((_o, value) => value !== null && value !== undefined)
  @Matches(/^[A-Z]{3}$/, { message: 'Код валюти ISO 4217: UAH, EUR, USD…' })
  currency?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  notifyOnPromo?: boolean;

  @ApiPropertyOptional({ type: [String], description: 'Порожній — усі мережі' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  chainIds?: string[];
}

export class UpdateSubscriptionDto {
  @ApiPropertyOptional({ type: Number, nullable: true })
  @ValidateIf((_o, value) => value !== null && value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000)
  targetPrice?: number | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'USD',
    description:
      'Валюта targetPrice (зазвичай валюта показу); ціни інших валют перераховуються за курсом',
  })
  @ValidateIf((_o, value) => value !== null && value !== undefined)
  @Matches(/^[A-Z]{3}$/, { message: 'Код валюти ISO 4217: UAH, EUR, USD…' })
  currency?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() notifyOnPromo?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

/** Дані для тексту сповіщення мовою покупця */
export class NotificationParamsDto {
  @ApiProperty({ description: 'Товар · фасування' }) product!: string;
  @ApiProperty() price!: number;
  @ApiProperty() currency!: string;
  @ApiProperty() chain!: string;
  @ApiProperty({ type: Number, nullable: true }) target!: number | null;
  @ApiProperty({ type: String, nullable: true })
  targetCurrency!: string | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Знижка, %' })
  discount!: number | null;
}

export class NotificationDto {
  @ApiProperty() id!: string;
  @ApiProperty({
    enum: [
      'PRICE_DROP',
      'PROMO_STARTED',
      'TARGET_PRICE_REACHED',
      'BACK_IN_STOCK',
    ],
  })
  type!: string;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ type: String, nullable: true }) productId!: string | null;
  @ApiProperty({
    type: NotificationParamsDto,
    nullable: true,
    description: 'null — старе сповіщення: показати title/body',
  })
  params!: NotificationParamsDto | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: String, nullable: true }) readAt!: string | null;
}
