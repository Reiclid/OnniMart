import {
  eventType,
  MAX_VIEWS,
  orderedViews,
  retentionCutoff,
} from './activity';

const NOW = new Date('2026-10-25T12:00:00.000Z');

describe('orderedViews', () => {
  it('повтор лишає останній перегляд, найновіший — з найбільшим часом', () => {
    const views = orderedViews(['a', 'b', 'a', 'c'], NOW);
    expect(views.map((v) => v.productId)).toEqual(['b', 'a', 'c']);
    expect(views.map((v) => NOW.getTime() - v.viewedAt.getTime())).toEqual([
      2, 1, 0,
    ]);
  });

  it(`не більше ${MAX_VIEWS}: відкидає найстаріші`, () => {
    const ids = Array.from({ length: MAX_VIEWS + 5 }, (_, i) => `p${i}`);
    const views = orderedViews(ids, NOW);
    expect(views).toHaveLength(MAX_VIEWS);
    expect(views[0].productId).toBe('p5');
    expect(views.at(-1)).toEqual({
      productId: `p${MAX_VIEWS + 4}`,
      viewedAt: NOW,
    });
  });
});

describe('події', () => {
  it('назва з API → enum БД', () => {
    expect(eventType('chain_click')).toBe('CHAIN_CLICK');
  });

  it('зберігаються 180 днів', () => {
    expect(retentionCutoff(NOW).toISOString()).toBe('2026-04-28T12:00:00.000Z');
  });
});
