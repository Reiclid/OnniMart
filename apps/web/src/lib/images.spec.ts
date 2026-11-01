import { HERO_WIDTH, optimizable, photoUrl } from './images';

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

describe('photoUrl', () => {
  it('одна адреса копії на фото — як у srcset next/image', () => {
    expect(photoUrl('https://img3.zakaz.ua/a b/1.jpg')).toBe('/_next/image?url=https%3A%2F%2Fimg3.zakaz.ua%2Fa%20b%2F1.jpg&w=640&q=75');
    expect(photoUrl('https://img3.zakaz.ua/1.jpg', HERO_WIDTH)).toContain('&w=1080&');
  });
});
