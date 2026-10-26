import type { ReactNode } from 'react';
import { compareWords } from '@/lib/compare';

/** Назва, де слова, яких немає в `other`, підсвічені: модератор одразу бачить різницю */
export function Highlight({ text, other }: { text: string; other: string }) {
  return (
    <>
      {compareWords(text, other).map((t, i) =>
        t.shared ? (
          <span key={i}>{t.text}</span>
        ) : (
          <mark key={i} className="rounded bg-amber-100 px-0.5 text-amber-900">
            {t.text}
          </mark>
        ),
      )}
    </>
  );
}

/** Вердикт поля: збігається / відрізняється / немає даних */
export function Verdict({ same }: { same: boolean | null }) {
  if (same === null) return <span className="text-xs text-slate-400">немає даних</span>;
  return same ? (
    <span className="rounded bg-green-50 px-1.5 py-0.5 text-xs font-medium text-green-700">✓ збігається</span>
  ) : (
    <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700">≠ відрізняється</span>
  );
}

/** Фото з сайту мережі або порожнє місце того самого розміру */
export function Thumb({ src, small }: { src: string | null; small?: boolean }) {
  const size = small ? 'h-14 w-14' : 'h-24 w-24';
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- зображення з сайту мережі
    <img src={src} alt="" className={`${size} shrink-0 rounded border border-slate-100 object-contain`} loading="lazy" />
  ) : (
    <div className={`grid ${size} shrink-0 place-items-center rounded bg-slate-100 text-xs text-slate-400`}>без фото</div>
  );
}

/** Рядок таблиці порівняння: підпис зліва, далі по клітинці на кожну колонку */
export function CompareRow({ label, cells }: { label: string; cells: ReactNode[] }) {
  return (
    <tr className="border-t border-slate-100 align-top">
      <th scope="row" className="w-28 bg-slate-50 px-3 py-2 text-left text-xs font-medium text-slate-500">
        {label}
      </th>
      {cells.map((cell, i) => (
        <td key={i} className={`px-3 py-2 text-sm ${i === 0 ? 'bg-blue-50/40' : ''}`}>
          {cell}
        </td>
      ))}
    </tr>
  );
}
