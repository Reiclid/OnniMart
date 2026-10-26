'use client';

import type { ReactNode } from 'react';
import { CheckIcon, listStyles } from './ui';

/**
 * Рядок вибору в налаштуваннях (Figma 18, 19): галочка brand праворуч у вибраного.
 * Зміна одразу надсилає свою форму — кнопки «Save» немає.
 */
export function ChoiceRow({
  type,
  name,
  value,
  defaultChecked,
  children,
}: {
  type: 'checkbox' | 'radio';
  name: string;
  value: string;
  defaultChecked: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`${listStyles.row} ${listStyles.link} cursor-pointer has-focus-visible:bg-page`}>
      <input
        type={type}
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="peer sr-only"
      />
      <span className="flex-1">{children}</span>
      <CheckIcon
        width={18}
        height={18}
        strokeWidth={2.25}
        className="scale-50 text-brand opacity-0 transition-[scale,opacity] duration-(--duration-spring-snappy) ease-spring-snappy peer-checked:scale-100 peer-checked:opacity-100"
      />
    </label>
  );
}
