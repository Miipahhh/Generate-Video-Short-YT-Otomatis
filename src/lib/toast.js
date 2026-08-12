// Lightweight pub/sub toast system — no context boilerplate needed.
// Any component can call toast.success('...') / toast.error('...') and the
// <ToastHost /> mounted once in App.jsx will pick it up and render it.

let listeners = [];
let idCounter = 0;

export function subscribeToast(fn) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

function push(message, opts = {}) {
  const item = {
    id: ++idCounter,
    message,
    title: opts.title,
    url: opts.url,
    type: opts.type || 'info',
    duration: opts.duration ?? 4500
  };
  listeners.forEach((fn) => fn(item));
  return item.id;
}

export const toast = (message, opts) => push(message, opts);
toast.success = (message, opts) => push(message, { ...opts, type: 'success' });
toast.error = (message, opts) => push(message, { ...opts, type: 'error' });
toast.info = (message, opts) => push(message, { ...opts, type: 'info' });
