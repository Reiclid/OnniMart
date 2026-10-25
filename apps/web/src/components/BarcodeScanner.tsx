'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ProductSummaryDto } from '@/api/generated/model';
import { moreProducts } from '@/app/(shop)/actions';
import { useT } from '@/i18n/client';
import { createDetector, isBarcode, type Detector } from '@/lib/barcode';
import { formatMoney } from '@/lib/format';
import { BellIcon, ProductImage, buttonStyles } from './ui';

type Camera = 'starting' | 'on' | 'blocked';
type Found = { code: string; product: ProductSummaryDto | null };

const SCAN_EVERY_MS = 250;

/**
 * Сканер на весь екран (Figma 04): камера відкривається одразу, штрихкод шукається в кадрі
 * кожні 250 мс, знайдений товар — у листі знизу. Без камери (немає HTTPS, заборонено
 * доступ) — фото або цифри вручну.
 */
export function BarcodeScanner() {
  const router = useRouter();
  const t = useT();
  const video = useRef<HTMLVideoElement>(null);
  const detector = useRef<Promise<Detector> | null>(null);
  const track = useRef<MediaStreamTrack | null>(null);
  const [camera, setCamera] = useState<Camera>('starting');
  const [torch, setTorch] = useState<boolean | null>(null); // null — ліхтарика немає
  const [found, setFound] = useState<Found | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getDetector = () => (detector.current ??= createDetector());

  async function lookup(code: string) {
    navigator.vibrate?.(40);
    const [product] = await moreProducts({ q: code, page: 1 });
    setFound({ code, product: product ?? null });
  }

  // Камера: задня, якщо є; зупиняємо при виході зі сторінки
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        // Камера доступна лише на HTTPS або localhost (на http://<IP>:3000 — ні)
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        track.current = stream.getVideoTracks()[0] ?? null;
        const capabilities = track.current?.getCapabilities?.() as { torch?: boolean } | undefined;
        if (capabilities?.torch) setTorch(false);
        video.current!.srcObject = stream;
        await video.current!.play();
        setCamera('on');
      } catch {
        if (!cancelled) setCamera('blocked');
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Пошук штрихкоду в кадрі, поки лист з результатом закритий
  useEffect(() => {
    if (camera !== 'on' || found) return;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const tick = async () => {
      try {
        const el = video.current;
        if (el && el.readyState >= 2) {
          const hit = (await (await getDetector()).detect(el)).find((b) => isBarcode(b.rawValue));
          if (hit && !stopped) return void (await lookup(hit.rawValue));
        }
      } catch {
        // кадр не прочитався — пробуємо наступний
      }
      if (!stopped) timer = setTimeout(() => void tick(), SCAN_EVERY_MS);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [camera, found]);

  async function toggleTorch() {
    if (torch === null || !track.current) return;
    await track.current.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
    setTorch(!torch);
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const [hit] = (await (await getDetector()).detect(await createImageBitmap(file))).filter((b) => isBarcode(b.rawValue));
      if (hit) await lookup(hit.rawValue);
      else setError(t('scanner.noBarcode'));
    } catch {
      setError(t('scanner.photoFailed'));
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black text-white">
      <video ref={video} playsInline muted className="absolute inset-0 size-full object-cover" />

      <div className="relative flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button type="button" onClick={() => router.back()} aria-label={t('scanner.close')} className="grid size-11 place-items-center rounded-full bg-white/15">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
        <h1 className="text-title-sm font-semibold">{t('scanner.title')}</h1>
        <button
          type="button"
          onClick={() => void toggleTorch()}
          aria-label={t('scanner.flashlight')}
          aria-pressed={torch ?? undefined}
          disabled={torch === null}
          className={`grid size-11 place-items-center rounded-full ${torch ? 'bg-white text-black' : 'bg-white/15'} disabled:opacity-0`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></svg>
        </button>
      </div>

      {camera !== 'blocked' && (
        <div className="relative mx-auto mt-16 flex w-[min(75vw,18rem)] flex-col items-center gap-6">
          <div className="relative aspect-[29/19] w-full">
            {['left-0 top-0 border-l-4 border-t-4 rounded-tl-xl', 'right-0 top-0 border-r-4 border-t-4 rounded-tr-xl', 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-xl', 'bottom-0 right-0 border-b-4 border-r-4 rounded-br-xl'].map((corner) => (
              <span key={corner} className={`absolute size-10 border-accent ${corner}`} />
            ))}
            {camera === 'on' && !found && <span className="absolute inset-x-4 top-1/2 h-0.5 rounded-full bg-brand shadow-[0_0_12px_var(--color-brand)]" />}
          </div>
          <p className="text-body font-semibold">{t(camera === 'starting' ? 'scanner.opening' : 'scanner.point')}</p>
        </div>
      )}

      {(camera === 'blocked' || found) && (
        <div className="absolute inset-x-0 bottom-0 space-y-4 rounded-t-xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-fg">
          <div className="mx-auto h-1 w-10 rounded-full bg-line" />
          {found ? (
            <FoundSheet found={found} onAgain={() => setFound(null)} />
          ) : (
            <ManualInput onPhoto={onPhoto} onCode={(code) => void lookup(code)} error={error} />
          )}
        </div>
      )}
    </div>
  );
}

function FoundSheet({ found, onAgain }: { found: Found; onAgain: () => void }) {
  const t = useT();
  const { product } = found;
  if (!product) {
    return (
      <>
        <p className="text-body">{t.rich('scanner.notFound', { code: <span key="code" className="font-semibold">{found.code}</span> })}</p>
        <button type="button" onClick={onAgain} className={`${buttonStyles.primary} w-full`}>
          {t('scanner.scanAgain')}
        </button>
      </>
    );
  }
  const best = product.prices[0];
  return (
    <>
      <div className="flex items-center gap-4">
        <ProductImage src={product.imageUrl} className="size-18 shrink-0 border border-line" />
        <p className="line-clamp-2 text-body font-semibold">{product.name}</p>
      </div>
      {best && (
        <div className="flex items-center justify-between rounded-lg bg-selected p-4">
          <span className="text-body font-semibold text-brand">{t('card.cheapestAt', { chain: best.minChain })}</span>
          <span className="text-title font-bold">{formatMoney(best.min, best.currency)}</span>
        </div>
      )}
      <Link href={`/products/${product.id}`} className={`${buttonStyles.primary} w-full`}>
        {t('scanner.openProduct')}
      </Link>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={onAgain} className={buttonStyles.secondary}>
          {t('scanner.scanAgain')}
        </button>
        <Link href={`/products/${product.id}`} className={buttonStyles.secondary}>
          <BellIcon width={20} height={20} />
          {t('product.trackPrice')}
        </Link>
      </div>
    </>
  );
}

function ManualInput({ onPhoto, onCode, error }: { onPhoto: (file: File | undefined) => void; onCode: (code: string) => void; error: string | null }) {
  const t = useT();
  return (
    <>
      <p className="text-body">{t('scanner.cameraUnavailable')}</p>
      <label className={`${buttonStyles.primary} w-full cursor-pointer`}>
        {t('scanner.takePhoto')}
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} />
      </label>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onCode(new FormData(e.currentTarget).get('code') as string);
        }}
      >
        <input
          name="code"
          inputMode="numeric"
          pattern="\d{8,14}"
          required
          placeholder="4820017000277"
          aria-label={t('scanner.digits')}
          title={t('scanner.digitsHint')}
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-4 text-body outline-none focus:border-accent"
        />
        <button type="submit" className={buttonStyles.secondary}>
          {t('scanner.find')}
        </button>
      </form>
      {error && <p role="alert" className="text-body-sm text-danger">{error}</p>}
    </>
  );
}
