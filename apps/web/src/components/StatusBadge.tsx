const STYLES: Record<string, { label: string; className: string }> = {
  QUEUED: { label: 'У черзі', className: 'bg-gray-100 text-gray-700' },
  RUNNING: { label: 'Виконується', className: 'bg-blue-100 text-blue-800' },
  SUCCESS: { label: 'Успішно', className: 'bg-green-100 text-green-800' },
  PARTIAL: { label: 'З помилками', className: 'bg-amber-100 text-amber-800' },
  FAILED: { label: 'Збій', className: 'bg-red-100 text-red-800' },
  PENDING: { label: 'Не зіставлено', className: 'bg-gray-100 text-gray-600' },
  AUTO_MATCHED: { label: 'Авто', className: 'bg-green-100 text-green-800' },
  CONFIRMED: { label: 'Підтверджено', className: 'bg-green-100 text-green-800' },
  REJECTED: { label: 'Відхилено', className: 'bg-red-100 text-red-800' },
};

export function StatusBadge({ status }: { status: string }) {
  const style = STYLES[status] ?? {
    label: status,
    className: 'bg-gray-100 text-gray-700',
  };
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${style.className}`}
    >
      {style.label}
    </span>
  );
}
