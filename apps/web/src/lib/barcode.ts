/** Штрихкоди на товарах: EAN-13, EAN-8, UPC-A, UPC-E */
export const BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;

/** 8–14 цифр — інше (QR, сміття розпізнавання) не шукаємо */
export const isBarcode = (code: string) => /^\d{8,14}$/.test(code);

export interface Detector {
  detect(source: HTMLVideoElement | ImageBitmap): Promise<{ rawValue: string }[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options: { formats: string[] }): Detector;
      getSupportedFormats(): Promise<string[]>;
    };
  }
}

/**
 * Вбудований BarcodeDetector є лише в Chrome на Android і macOS; на iPhone, у Firefox і
 * на Windows — ZXing у WebAssembly (barcode-detector), WASM з нашого сервера.
 */
export async function createDetector(): Promise<Detector> {
  const native = window.BarcodeDetector;
  if (native && (await native.getSupportedFormats()).includes('ean_13')) {
    return new native({ formats: [...BARCODE_FORMATS] });
  }
  const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill');
  prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? '/zxing-reader.wasm' : prefix + path) } });
  return new BarcodeDetector({ formats: [...BARCODE_FORMATS] });
}
