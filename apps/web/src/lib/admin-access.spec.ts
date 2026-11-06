import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { adminAccess, adminGate } from './admin-access';

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
    // Підробку заголовків тут не відрізнити: від неї захищає лише прослуховування 127.0.0.1
    const web = JSON.parse(readFileSync(join(import.meta.dir, '../../package.json'), 'utf8'));
    expect(web.scripts.dev).toContain('--hostname 127.0.0.1');
    expect(web.scripts.start).toContain('--hostname 127.0.0.1');
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

  it('після 10 невдалих паролів адресу не пускає навіть з правильним, інші адреси — так', () => {
    const from = (ip: string, password: string) =>
      new Headers({ host: 'abc.trycloudflare.com', 'cf-connecting-ip': ip, authorization: basic('admin', password) });
    for (let i = 0; i < 10; i++) expect(adminAccess(from('6.6.6.6', `guess${i}`), 'secret')).toBe('challenge');
    expect(adminAccess(from('6.6.6.6', 'secret'), 'secret')).toBe('forbidden');
    expect(adminAccess(from('7.7.7.7', 'secret'), 'secret')).toBe('ok');
  });
});

describe('adminGate (лише акаунт ADMIN_EMAIL)', () => {
  const remote = new Headers({ host: 'abc.trycloudflare.com' });
  const env = { adminEmail: 'owner@example.com' };
  const answer = (value: boolean | null) => () => Promise.resolve(value);

  it('без ADMIN_EMAIL — як раніше, API не питаємо', async () => {
    const isAdmin = jest.fn(answer(true));
    expect(await adminGate(remote, {}, isAdmin)).toBe('forbidden');
    expect(isAdmin).not.toHaveBeenCalled();
  });

  it('пускає лише адміністратора, не важливо звідки; гостя — на вхід', async () => {
    expect(await adminGate(remote, env, answer(true))).toBe('ok');
    expect(await adminGate(remote, env, answer(false))).toBe('forbidden');
    expect(await adminGate(remote, env, answer(null))).toBe('login');
    expect(await adminGate(new Headers({ host: 'localhost:3000' }), env, answer(false))).toBe('forbidden');
  });

  it('з ADMIN_WEB_PASSWORD — спершу пароль, потім акаунт', async () => {
    const isAdmin = jest.fn(answer(true));
    expect(await adminGate(remote, { ...env, password: 'secret' }, isAdmin)).toBe('challenge');
    expect(isAdmin).not.toHaveBeenCalled();
    const withPassword = new Headers({ host: 'abc.trycloudflare.com', authorization: basic('x', 'secret') });
    expect(await adminGate(withPassword, { ...env, password: 'secret' }, answer(false))).toBe('forbidden');
  });
});
