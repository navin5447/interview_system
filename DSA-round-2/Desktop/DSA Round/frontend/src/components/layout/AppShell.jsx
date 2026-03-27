import { motion } from 'framer-motion';

export function AppShell({ title, subtitle, actions, children }) {
  return (
    <div className="min-h-screen flex flex-col bg-transparent">
      <header className="px-6 sm:px-10 py-4 flex items-center justify-between border-b border-borderSubtle bg-surface/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-primary-600 to-skyAccent shadow-sm" />
          <div>
            <div className="text-[10px] tracking-[0.28em] uppercase text-gray-500">Agentica</div>
            <div className="text-xs font-medium text-graphite">AI DSA Interview</div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">{actions}</div>
      </header>

      <main className="flex-1 px-4 sm:px-8 py-6 max-w-6xl mx-auto w-full">
        {(title || subtitle) && (
          <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              {title && (
                <h1 className="text-3xl sm:text-4xl font-normal tracking-[0.18em] uppercase" style={{ fontFamily: 'Bebas Neue, system-ui, sans-serif' }}>
                  {title}
                </h1>
              )}
              {subtitle && <p className="mt-1 text-sm text-gray-600 max-w-xl">{subtitle}</p>}
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}
