import clsx from 'clsx';

export function TextField({ className, ...rest }) {
  return (
    <input
      {...rest}
      className={clsx(
        'w-full rounded-xl border border-borderSubtle bg-white/90 px-3 py-2 text-sm text-graphite outline-none transition-all',
        'focus:border-primary-500 focus:ring-2 focus:ring-primary-200 focus:ring-offset-1 focus:ring-offset-surfaceMuted',
        className
      )}
    />
  );
}
