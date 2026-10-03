import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'

export const metadata: Metadata = {
  title: 'ECHONA 2K26 — Treasure Voyage',
  description: 'Join the Echona 2K26 Treasure Voyage.',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark bg-background" suppressHydrationWarning>
      <head suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // 1. Instantly strip extension-injected attributes from the DOM before React hydrates
              const stripAttributes = () => {
                document.querySelectorAll('[bis_skin_checked]').forEach(el => el.removeAttribute('bis_skin_checked'));
              };
              const observer = new MutationObserver((mutations) => {
                let needsStrip = false;
                for (const m of mutations) {
                  if (m.type === 'attributes' && m.attributeName === 'bis_skin_checked') {
                    m.target.removeAttribute('bis_skin_checked');
                  } else if (m.type === 'childList') {
                    needsStrip = true;
                  }
                }
                if (needsStrip) stripAttributes();
              });
              observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true });
              stripAttributes();

              // 2. Intercept legacy console errors
              const originalError = console.error;
              console.error = function(...args) {
                const msg = args[0] instanceof Error ? args[0].message : (typeof args[0] === 'string' ? args[0] : '');
                if (msg.includes('A tree hydrated but') || msg.includes('Hydration failed') || msg.includes('M_ID') || msg.includes('bis_skin_checked')) return;
                originalError.apply(console, args);
              };

              // 3. Stop extension unhandled errors from hitting Next.js Dev Overlay
              const originalAddEventListener = window.addEventListener;
              window.addEventListener = function(type, listener, options) {
                if (type === 'error' || type === 'unhandledrejection') {
                  const wrapped = function(event) {
                    const str = (event && event.message) ? String(event.message) : '';
                    const stack = (event && event.reason && event.reason.stack) ? String(event.reason.stack) : '';
                    const msg = (event && event.reason && event.reason.message) ? String(event.reason.message) : '';
                    const file = (event && event.filename) ? String(event.filename) : '';
                    if (str.includes('M_ID') || msg.includes('M_ID') || stack.includes('chrome-extension://') || file.includes('chrome-extension://')) {
                      event.preventDefault();
                      event.stopImmediatePropagation();
                      return;
                    }
                    return typeof listener === 'function' ? listener.apply(this, arguments) : listener.handleEvent(event);
                  };
                  return originalAddEventListener.call(this, type, wrapped, options);
                }
                return originalAddEventListener.apply(this, arguments);
              };
              const originalOnError = window.onerror;
              window.onerror = function(message, source, lineno, colno, error) {
                if (String(source).includes('chrome-extension://') || String(message).includes('M_ID')) return true;
                if (originalOnError) return originalOnError.apply(this, arguments);
                return false;
              };
            `
          }}
        />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
