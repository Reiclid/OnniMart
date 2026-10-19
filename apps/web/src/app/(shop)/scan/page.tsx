import { BarcodeScanner } from '@/components/BarcodeScanner';

export default function ScanPage() {
  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="space-y-1">
        <h1 className="text-display font-bold">Scan barcode</h1>
        <p className="text-body text-fg-muted">See where this product is cheapest right now.</p>
      </div>
      <BarcodeScanner />
    </div>
  );
}
