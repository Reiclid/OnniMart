import { adminAccess } from './admin-access';

const basic = (user: string, password: string) => `Basic ${btoa(`${user}:${password}`)}`;

describe('adminAccess', () => {
  it('без пароля — лише прямий запит на localhost', () => {
    expect(adminAccess(new Headers({ host: 'localhost:3000' }), undefined)).toBe('ok');
    expect(adminAccess(new Headers({ host: '127.0.0.1:3000' }), undefined)).toBe('ok');
    // Так запит бачить сам Next dev: x-forwarded-* з адресою клієнта
    const fromNext = { host: 'localhost:3000', 'x-forwarded-host': 'localhost:3000' };
    expect(adminAccess(new Headers({ ...fromNext, 'x-forwarded-for': '::1' }), undefined)).toBe('ok');
    expect(adminAccess(new Headers({ ...fromNext, 'x-forwarded-for': '1.2.3.4' }), undefined)).toBe('forbidden');
    expect(adminAccess(new Headers({ ...fromNext, 'x-forwarded-for': '1.2.3.4, ::1' }), undefined)).toBe('forbidden');
    expect(adminAccess(new Headers({ host: 'abc.trycloudflare.com' }), undefined)).toBe('forbidden');
    expect(adminAccess(new Headers({ host: '192.168.1.5:3000' }), undefined)).toBe('forbidden');
    // Тунель може передати Host: localhost, але додає свої заголовки
    expect(adminAccess(new Headers({ host: 'localhost:3000', 'cf-connecting-ip': '1.2.3.4' }), undefined)).toBe('forbidden');
  });

  it('з паролем — Basic-авторизація, ім`я будь-яке, пароль з двокрапкою', () => {
    const headers = (authorization?: string) =>
      new Headers({ host: 'abc.trycloudflare.com', ...(authorization && { authorization }) });
    expect(adminAccess(headers(), 'p:ss')).toBe('challenge');
    expect(adminAccess(headers(basic('admin', 'wrong')), 'p:ss')).toBe('challenge');
    expect(adminAccess(headers('Bearer p:ss'), 'p:ss')).toBe('challenge');
    expect(adminAccess(headers('Basic %%%'), 'p:ss')).toBe('challenge');
    expect(adminAccess(headers(basic('admin', 'p:ss')), 'p:ss')).toBe('ok');
  });
});
