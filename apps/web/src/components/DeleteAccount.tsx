'use client';

import { useRef } from 'react';
import { deleteAccount } from '@/app/(shop)/actions';
import { useT } from '@/i18n/client';
import { buttonStyles, listStyles } from './ui';

/** «Delete account» у налаштуваннях і шторка-підтвердження знизу (Figma 20) */
export function DeleteAccount() {
  const t = useT();
  const sheet = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" onClick={() => sheet.current?.showModal()} className={`${listStyles.row} ${listStyles.link} text-danger`}>
        {t('settings.deleteAccount')}
      </button>
      {/* Шторка виїжджає знизу (base, enter); клік по затемненню закриває */}
      <dialog
        ref={sheet}
        aria-labelledby="delete-account-title"
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
        className="mx-auto mt-auto mb-0 w-full max-w-lg translate-y-full rounded-t-xl bg-surface px-4 pt-2 pb-[max(2rem,env(safe-area-inset-bottom))] text-fg transition-[translate,display,overlay] transition-discrete duration-(--duration-base) ease-enter backdrop:bg-black/40 open:translate-y-0 starting:open:translate-y-full"
      >
        <span aria-hidden className="mx-auto mb-4 block h-1 w-9 rounded-full bg-line-strong" />
        <h2 id="delete-account-title" className="text-title font-bold">{t('settings.deleteTitle')}</h2>
        <p className="mt-1 text-body-sm text-fg-muted">{t('settings.deleteWarning')}</p>
        <form action={deleteAccount} className="mt-5 space-y-2">
          <button
            type="submit"
            className="press inline-flex w-full items-center justify-center rounded-md bg-danger px-5 py-3.5 text-body font-semibold text-white hover:bg-[color-mix(in_oklch,var(--color-danger),black_8%)] active:bg-[color-mix(in_oklch,var(--color-danger),black_8%)]"
          >
            {t('settings.deleteConfirm')}
          </button>
          <button type="button" onClick={() => sheet.current?.close()} className={`${buttonStyles.secondary} w-full`}>
            {t('settings.cancel')}
          </button>
        </form>
      </dialog>
    </>
  );
}
