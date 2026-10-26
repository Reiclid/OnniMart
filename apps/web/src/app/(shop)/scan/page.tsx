import { BarcodeScanner } from '@/components/BarcodeScanner';
import { currentMoney } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function ScanPage() {
  return <BarcodeScanner money={await currentMoney()} />;
}
