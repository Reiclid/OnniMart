import { MAX_VIEWS, parseConsent, parseViews, pushView, serializeViews } from './views';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('історія гостя', () => {
  it('відкритий товар стає першим, повтор не дублюється', () => {
    expect(pushView([id(1), id(2)], id(2))).toEqual([id(2), id(1)]);
    expect(pushView([], id(3))).toEqual([id(3)]);
  });

  it(`памʼятає не більше ${MAX_VIEWS}, найстаріші випадають`, () => {
    const full = Array.from({ length: MAX_VIEWS }, (_, i) => id(i));
    const next = pushView(full, id(999));
    expect(next).toHaveLength(MAX_VIEWS);
    expect(next[0]).toBe(id(999));
    expect(next).not.toContain(id(MAX_VIEWS - 1));
  });

  it('cookie: туди й назад; зіпсовані значення відкидаються', () => {
    expect(parseViews(serializeViews([id(1), id(2)]))).toEqual([id(1), id(2)]);
    expect(parseViews(`${id(1)}.<script>.${id(1)}`)).toEqual([id(1)]);
    expect(parseViews(undefined)).toEqual([]);
  });

  it('згода: uuid — так, no — відмова, інше — ще не питали', () => {
    expect(parseConsent(id(7))).toEqual({ anonId: id(7) });
    expect(parseConsent('no')).toBe('declined');
    expect(parseConsent('yes')).toBeNull();
    expect(parseConsent(undefined)).toBeNull();
  });
});
