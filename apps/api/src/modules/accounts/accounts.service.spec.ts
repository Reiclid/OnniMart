import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AccountsService } from './accounts.service';

const idToken = (claims: object) =>
  `h.${Buffer.from(
    JSON.stringify({
      iss: 'https://accounts.google.com',
      aud: 'client-1',
      exp: Date.now() / 1000 + 300,
      nonce: 'n1',
      sub: 'g-1',
      email: 'Olena.K@gmail.com',
      email_verified: true,
      name: 'Olena',
      ...claims,
    }),
  ).toString('base64url')}.s`;

const user = (fields: object) => ({
  id: 'u1',
  email: 'olena.k@gmail.com',
  name: null,
  googleSub: null,
  countryCode: 'UA',
  currencyCode: null,
  notifyPush: true,
  notifyEmail: false,
  minDiscount: 0,
  chainIds: [],
  interests: [],
  telemetryConsentAt: null,
  createdAt: new Date(),
  ...fields,
});

describe('AccountsService.google', () => {
  const dto = {
    code: 'c',
    codeVerifier: 'v'.repeat(43),
    redirectUri: 'http://localhost:3000/auth/google/callback',
    nonce: 'n1',
  };
  const realFetch = globalThis.fetch;
  let prisma: {
    user: Record<string, jest.Mock>;
    session: Record<string, jest.Mock>;
  };
  let service: AccountsService;
  const google = (claims: object = {}) => {
    globalThis.fetch = async () => Response.json({ id_token: idToken(claims) });
  };

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'client-1';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    prisma = {
      user: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async ({ data }) => user(data)),
        update: jest.fn(async ({ data }) => user(data)),
      },
      session: { create: jest.fn(async () => ({})) },
    };
    service = new AccountsService(prisma as never);
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('новий покупець — акаунт без пароля з Google sub', async () => {
    google();
    const session = await service.google(dto);
    expect(session.created).toBe(true);
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: 'olena.k@gmail.com',
        name: 'Olena',
        googleSub: 'g-1',
        countryCode: 'UA',
      },
    });
  });

  it('наявний акаунт з паролем за email — прив’язується, не створюється', async () => {
    google();
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(user({ passwordHash: 'scrypt:…' }));
    const session = await service.google(dto);
    expect(session.created).toBe(false);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { googleSub: 'g-1', name: 'Olena' },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('email уже прив’язаний до іншого Google-акаунта — 409', async () => {
    google();
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(user({ googleSub: 'g-2' }));
    await expect(service.google(dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('токен не пройшов перевірку — 401 і жодного акаунта', async () => {
    google({ nonce: 'чужий' });
    await expect(service.google(dto)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
