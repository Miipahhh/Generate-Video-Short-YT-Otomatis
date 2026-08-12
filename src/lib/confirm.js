// Imperative confirm() replacement backed by an in-app modal (<ConfirmHost /> in App.jsx)
// instead of the jarring native browser confirm() dialog.

let opener = null;

export function registerConfirmOpener(fn) {
  opener = fn;
}

export function confirmAction(message, opts = {}) {
  if (!opener) return Promise.resolve(window.confirm(message));
  return opener(message, opts);
}
