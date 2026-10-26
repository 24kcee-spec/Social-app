/** A shared accessible browser dialog. Text is never interpreted as HTML. */
export function confirmAction(message: string, label = 'Confirm'): Promise<boolean> {
  return new Promise((resolve) => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.createElement('dialog');
    dialog.className = 'sidle-confirm-dialog';
    const title = document.createElement('h2');
    title.id = crypto.randomUUID();
    title.textContent = 'Please confirm';
    dialog.setAttribute('aria-labelledby', title.id);
    const text = document.createElement('p');
    text.textContent = message;
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'secondary';
    cancel.textContent = 'Cancel';
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.textContent = label;
    const finish = (accepted: boolean) => {
      dialog.close();
      dialog.remove();
      previous?.focus();
      resolve(accepted);
    };
    cancel.onclick = () => finish(false);
    confirm.onclick = () => finish(true);
    dialog.oncancel = (event) => {
      event.preventDefault();
      finish(false);
    };
    actions.append(cancel, confirm);
    dialog.append(title, text, actions);
    document.body.append(dialog);
    dialog.showModal();
    cancel.focus();
  });
}
