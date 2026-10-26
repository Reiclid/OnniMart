'use client';

import { useEffect } from 'react';

/** Відкритий товар — у «Recently viewed» (маршрут /products/[id]/view); раз на показ сторінки */
export function RecordView({ productId }: { productId: string }) {
  useEffect(() => {
    void fetch(`/products/${productId}/view`, { method: 'POST', keepalive: true }).catch(() => undefined);
  }, [productId]);
  return null;
}
