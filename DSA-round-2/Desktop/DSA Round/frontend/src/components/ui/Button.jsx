import { motion } from 'framer-motion';
import clsx from 'clsx';

export function Button({
  variant = 'primary',
  fullWidth,
  className,
  children,
  ...rest
}) {
  const base =
    'inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium outline-none border border-transparent transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surfaceMuted focus-visible:ring-primary-400 disabled:opacity-60 disabled:cursor-not-allowed';

  const variants = {
    primary:
      'bg-gradient-to-r from-primary-600 to-skyAccent text-white shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-hover)]',
    ghost:
      'bg-transparent text-graphite border border-borderSubtle hover:bg-primary-50',
    soft:
      'bg-primary-50 text-primary-700 hover:bg-primary-100',
    danger:
      'bg-red-600 text-white hover:bg-red-700',
  };

  return (
    <motion.button
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97, y: 0 }}
      className={clsx(base, variants[variant], fullWidth && 'w-full', className)}
      {...rest}
    >
      {children}
    </motion.button>
  );
}
