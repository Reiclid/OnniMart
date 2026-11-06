import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
import {
  BrandsController,
  CatalogController,
  MatchingController,
  RulesController,
  VariationsController,
} from '../modules/catalog/catalog.controller';
import { ScraperController } from '../modules/scraper/scraper.controller';

/** Контролери адмінки: кожна зміна в них — за токеном, з лімітом і позначена у Swagger */
const CONTROLLERS = [
  CatalogController,
  MatchingController,
  RulesController,
  VariationsController,
  BrandsController,
  ScraperController,
];
/** Як декоратори @MutationLimit і @ApiBearerAuth зберігають свої дані */
const LIMIT_KEY = 'THROTTLER:LIMITdefault';
const SECURITY_KEY = 'swagger/apiSecurity';

function mutations() {
  return CONTROLLERS.flatMap((controller) => {
    const proto = controller.prototype as unknown as Record<string, object>;
    return Object.getOwnPropertyNames(proto)
      .filter((name) => name !== 'constructor')
      .map((name) => ({
        route: `${controller.name}.${name}`,
        handler: proto[name],
      }))
      .filter(({ handler }) => {
        const method: unknown = Reflect.getMetadata(METHOD_METADATA, handler);
        return method !== undefined && method !== RequestMethod.GET;
      });
  });
}

describe('зміни адмінки', () => {
  it('знайдено всі маршрути', () => {
    expect(mutations().length).toBeGreaterThanOrEqual(19);
  });

  it('кожна має ліміт MutationLimit', () => {
    const missing = mutations().filter(
      ({ handler }) => !Reflect.hasMetadata(LIMIT_KEY, handler),
    );
    expect(missing.map(({ route }) => route)).toEqual([]);
  });

  it('кожна позначена ApiBearerAuth', () => {
    const missing = mutations().filter(
      ({ handler }) => !Reflect.hasMetadata(SECURITY_KEY, handler),
    );
    expect(missing.map(({ route }) => route)).toEqual([]);
  });
});
