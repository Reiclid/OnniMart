import { optimizable } from './images';

describe('optimizable', () => {
  it('лише відомі домени мереж', () => {
    expect(optimizable('https://img3.zakaz.ua/abc/1.jpg')).toBe(true);
    expect(optimizable('http://varus.ua/media/x.png')).toBe(true);
    expect(optimizable('https://evil.example/zakaz.ua.jpg')).toBe(false);
    expect(optimizable('https://img3.zakaz.ua.evil.example/1.jpg')).toBe(false);
  });

  it('зіпсована адреса — ні', () => {
    expect(optimizable('not a url')).toBe(false);
  });
});
