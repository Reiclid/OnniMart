import { clientAddress } from './client-address';

describe('clientAddress', () => {
  it('через тунель — адреса від Cloudflare', () => {
    expect(clientAddress(new Headers({ 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' }))).toBe('1.2.3.4');
  });

  it('напряму — перша адреса з x-forwarded-for', () => {
    expect(clientAddress(new Headers({ 'x-forwarded-for': '5.6.7.8, ::1' }))).toBe('5.6.7.8');
  });

  it('без заголовків — невідомо', () => {
    expect(clientAddress(new Headers())).toBeUndefined();
  });
});
