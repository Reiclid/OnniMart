'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ScanIcon, buttonStyles } from './ui';

// shortcut: BarcodeDetector є лише в Chromium (Android, desktop); Safari — ручне введення цифр
declare const BarcodeDetector: {
  new (options: { formats: string[] }): { detect(image: ImageBitmap): Promise<{ rawValue: string }[]> };
};

/** Штрихкод з фото камери (або введений вручну) → пошук: API знаходить товар за GTIN */
export function BarcodeScanner() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const open = (code: string) => router.push(`/products?q=${encodeURIComponent(code)}`);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (typeof BarcodeDetector === 'undefined') {
      setError('This browser cannot read barcodes from photos. Type the digits below.');
      return;
    }
    const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    const [hit] = await detector.detect(await createImageBitmap(file));
    if (hit) open(hit.rawValue);
    else setError('No barcode found. Take the photo closer, or type the digits below.');
  }

  return (
    <div className="space-y-6">
      <label className={`${buttonStyles.primary} w-full cursor-pointer`}>
        <ScanIcon />
        Take a photo of the barcode
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} />
      </label>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          open(new FormData(e.currentTarget).get('code') as string);
        }}
      >
        <input
          name="code"
          inputMode="numeric"
          pattern="\d{8,14}"
          required
          placeholder="4820017000277"
          aria-label="Barcode digits"
          title="8–14 digits"
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-4 text-body outline-none focus:border-brand"
        />
        <button type="submit" className={buttonStyles.secondary}>
          Find
        </button>
      </form>
      {error && <p role="alert" className="text-body-sm text-danger">{error}</p>}
    </div>
  );
}
