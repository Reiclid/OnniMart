import { ImageResponse } from 'next/og';
import { primitives } from '@/design/tokens';

const SIZES = [96, 180, 192, 512];

/** Іконка застосунку (головний екран, сповіщення): «O» на кольорі бренду, на весь квадрат — годиться і для maskable */
export async function GET(_request: Request, ctx: RouteContext<'/pwa-icon/[size]'>) {
  const size = Number((await ctx.params).size);
  if (!SIZES.includes(size)) return new Response(null, { status: 404 });
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: primitives['blue/700'],
          color: primitives.white,
          fontSize: size * 0.5,
          fontWeight: 700,
        }}
      >
        O
      </div>
    ),
    { width: size, height: size, headers: { 'Cache-Control': 'public, max-age=604800' } },
  );
}
