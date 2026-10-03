// @ts-nocheck
'use client'

if (typeof window !== 'undefined') {
  // 1. Intercept console.error to block hydration warnings
  const originalError = console.error;
  console.error = function(...args) {
    const msg = args[0] instanceof Error ? args[0].message : (typeof args[0] === 'string' ? args[0] : '');
    if (
      msg.includes("A tree hydrated but some attributes of the server rendered HTML didn't match") || 
      msg.includes('Hydration failed because') || 
      msg.includes('M_ID') ||
      msg.includes('bis_skin_checked')
    ) {
      return;
    }
    originalError.apply(console, args);
  };

  // 2. Monkey-patch addEventListener to block Next.js Dev Overlay from seeing extension errors
  const originalAddEventListener = window.addEventListener;
  window.addEventListener = function(type, listener, options) {
    if (type === 'error' || type === 'unhandledrejection') {
      const wrappedListener = function(event: any) {
        const isExtensionError = 
          (event?.filename && event.filename.includes('chrome-extension://')) ||
          (event?.message && event.message.includes('M_ID')) ||
          (event?.reason?.message && event.reason.message.includes('M_ID')) ||
          (event?.reason?.stack && event.reason.stack.includes('chrome-extension://'));
        
        if (isExtensionError) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        
        if (typeof listener === 'function') {
          return listener.apply(this, arguments as any);
        } else if (listener && typeof listener === 'object' && typeof listener.handleEvent === 'function') {
          return listener.handleEvent(event);
        }
      };
      return originalAddEventListener.call(this, type, wrappedListener, options);
    }
    return originalAddEventListener.apply(this, arguments as any);
  };

  // 3. Block window.onerror
  const originalOnError = window.onerror;
  window.onerror = function(message, source, lineno, colno, error) {
    if (source && source.includes('chrome-extension://')) return true;
    if (message && message.toString().includes('M_ID')) return true;
    if (originalOnError) return originalOnError(message, source, lineno, colno, error);
    return false;
  };
}

export function ErrorSilencer() {
  return null;
}
