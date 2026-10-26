'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent, type ReactNode } from 'react';
import {
  addBarcodeAction,
  removeBarcodeAction,
  updateProductAction,
  updateVariantAction,
  type ActionResult,
} from '@/app/actions';
import type { CategoryDto, ProductDetailsDto, ProductVariantDto } from '@/api/generated/model';

const INPUT = 'w-full rounded border border-slate-300 px-2 py-1 text-sm';
const BUTTON =
  'rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50';

/** Виконує серверну дію, показує помилку й оновлює сторінку після успіху */
function useSave() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [, startTransition] = useTransition();

  async function save(call: () => Promise<ActionResult>) {
    setBusy(true);
    setError(null);
    setSaved(false);
    const { error } = await call();
    setBusy(false);
    if (error) return setError(error);
    setSaved(true);
    startTransition(() => router.refresh());
  }
  return { busy, error, saved, save };
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

function Status({ busy, error, saved }: { busy: boolean; error: string | null; saved: boolean }) {
  if (error) return <span className="text-xs text-red-600">{error}</span>;
  if (saved && !busy) return <span className="text-xs text-green-700">Збережено</span>;
  return null;
}

/** Змінені поля форми; порожнє поле → null (очистити) */
function changes<T extends string>(form: FormData, initial: Record<T, string>) {
  const patch: Partial<Record<T, string | null>> = {};
  for (const key of Object.keys(initial) as T[]) {
    const value = String(form.get(key) ?? '').trim();
    if (value !== initial[key]) patch[key] = value || null;
  }
  return patch;
}

/** Характеристики товару: назва, бренд, різновид, категорія, фото, опис */
export function ProductEditor({
  product,
  categories,
}: {
  product: ProductDetailsDto;
  categories: CategoryDto[];
}) {
  const { busy, error, saved, save } = useSave();
  const initial = {
    name: product.name,
    brand: product.brand ?? '',
    variantLabel: product.variantLabel ?? '',
    category: product.categoryLocked ? (product.category?.slug ?? '') : '',
    imageUrl: product.imageUrl ?? '',
    description: product.description ?? '',
  };

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const patch = changes(new FormData(event.currentTarget), initial);
    if (Object.keys(patch).length === 0) return;
    // Назва обовʼязкова (required), тож null тут не буває
    void save(() => updateProductAction(product.id, { ...patch, name: patch.name ?? undefined }));
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <Field label="Назва">
        <input name="name" defaultValue={initial.name} required maxLength={200} className={INPUT} />
      </Field>
      <Field label="Бренд" hint="Порожньо — без бренду">
        <input name="brand" defaultValue={initial.brand} maxLength={80} className={INPUT} />
      </Field>
      <Field label="Різновид у лінійці" hint="Смак чи версія: Zero, Cherry, Класична">
        <input name="variantLabel" defaultValue={initial.variantLabel} maxLength={80} className={INPUT} />
      </Field>
      <Field
        label="Категорія"
        hint={
          product.categoryLocked
            ? 'Задана вручну — зіставлення її не змінює'
            : `Зараз автоматично: ${product.category?.name ?? 'без категорії'}`
        }
      >
        <select name="category" defaultValue={initial.category} className={INPUT}>
          <option value="">Автоматично (за картками мереж)</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Фото (адреса)">
        <input name="imageUrl" type="url" defaultValue={initial.imageUrl} className={INPUT} />
      </Field>
      <Field label="Опис">
        <textarea name="description" defaultValue={initial.description} maxLength={2000} rows={2} className={INPUT} />
      </Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={busy} className={BUTTON}>
          {busy ? '…' : 'Зберегти товар'}
        </button>
        <Status busy={busy} error={error} saved={saved} />
      </div>
    </form>
  );
}

/** Фасування: кількість, підпис, упаковка і штрихкоди */
export function VariantEditor({ variant }: { variant: ProductVariantDto }) {
  const form = useSave();
  const codes = useSave();
  const initial = { quantity: variant.label, label: variant.label, packaging: variant.packaging ?? '' };

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Нове фасування без нового підпису — підпис складе API
    const patch = changes(new FormData(event.currentTarget), initial);
    if (Object.keys(patch).length === 0) return;
    void form.save(() =>
      updateVariantAction(variant.id, {
        quantity: patch.quantity ?? undefined,
        label: patch.label ?? undefined,
        packaging: patch.packaging,
      }),
    );
  }

  function addCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem('gtin') as HTMLInputElement;
    const gtin = input.value.trim();
    if (!gtin) return;
    void codes.save(async () => {
      const result = await addBarcodeAction(variant.id, gtin);
      if (!result.error) input.value = '';
      return result;
    });
  }

  function removeCode(gtin: string) {
    if (!window.confirm(`Прибрати штрихкод ${gtin} з фасування «${variant.label}»?`)) return;
    void codes.save(() => removeBarcodeAction(variant.id, gtin));
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <form onSubmit={submit} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <Field label="Фасування" hint="0,5 л · 6 × 330 мл · 200 г · 10 шт">
          <input name="quantity" defaultValue={initial.quantity} required maxLength={40} className={INPUT} />
        </Field>
        <Field label="Підпис">
          <input name="label" defaultValue={initial.label} required maxLength={40} className={INPUT} />
        </Field>
        <Field label="Упаковка" hint="ПЕТ, скло, з/б">
          <input name="packaging" defaultValue={initial.packaging} maxLength={40} className={INPUT} />
        </Field>
        <div className="flex flex-col items-start gap-1 pb-5">
          <button type="submit" disabled={form.busy} className={BUTTON}>
            {form.busy ? '…' : 'Зберегти'}
          </button>
        </div>
      </form>
      <Status busy={form.busy} error={form.error} saved={form.saved} />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-600">Штрихкоди:</span>
        {variant.barcodes.length === 0 && <span className="text-xs text-slate-400">немає</span>}
        {variant.barcodes.map((gtin) => (
          <span key={gtin} className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 font-mono text-xs ring-1 ring-slate-200">
            {gtin}
            <button
              type="button"
              onClick={() => removeCode(gtin)}
              disabled={codes.busy}
              aria-label={`Прибрати ${gtin}`}
              className="text-slate-400 hover:text-red-600"
            >
              ×
            </button>
          </span>
        ))}
        <form onSubmit={addCode} className="inline-flex items-center gap-2">
          <input name="gtin" inputMode="numeric" placeholder="EAN-13" className="w-36 rounded border border-slate-300 px-2 py-0.5 font-mono text-xs" />
          <button type="submit" disabled={codes.busy} className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs hover:bg-slate-50">
            Додати
          </button>
        </form>
        <Status busy={codes.busy} error={codes.error} saved={codes.saved} />
      </div>
    </div>
  );
}
