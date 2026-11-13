async function prepare({ url, text }) {
  const target = new URL(url);
  const path = /^\/app\/accounts\/\d+\/(?:inbox\/\d+\/)?conversations\/\d+\/?$/;
  const allowed = await chrome.permissions.contains({ origins: [target.origin + '/*'] });
  if (target.protocol !== 'https:' || !allowed || !path.test(target.pathname) || target.username || target.password) {
    throw new Error('Conversa fora dos destinos autorizados pela extensão.');
  }
  const { id } = await chrome.tabs.create({ url: target.origin + target.pathname });
  const end = Date.now() + 25000;
  while (Date.now() < end) {
    const tab = await chrome.tabs.get(id);
    if (tab.status === 'complete') {
      try {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: id },
          func: fillReply,
          args: [target.origin, target.pathname.replace(/\/$/, ''), text],
        });
        if (result.result === 'filled') return;
        if (result.result === 'unverified') throw new Error('Confira o editor do Chatwoot. O texto inserido não pôde ser confirmado.');
        if (result.result === 'draft') throw new Error('A conversa já tem um rascunho. Use a cópia para preservá-lo.');
        if (result.result === 'private') throw new Error('Selecione Resposta pública no Chatwoot e tente novamente pela cópia.');
      } catch (error) {
        if (!String(error).includes('Cannot access') && !String(error).includes('No frame')) throw error;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 650));
  }
  throw new Error('O editor de resposta pública não foi identificado. Confira o login e use a cópia.');
}

function fillReply(origin, path, text) {
  if (location.origin !== origin || location.pathname.replace(/\/$/, '') !== path) return 'other';
  const visible = node => node.getClientRects().length > 0;
  const boxes = [...document.querySelectorAll('.reply-box')].filter(visible);
  if (boxes.length !== 1) return 'waiting';
  const box = boxes[0];
  if (box.classList.contains('is-private')) return 'private';
  const editors = [...box.querySelectorAll('textarea, .ProseMirror[contenteditable="true"]')]
    .filter(node => visible(node) && !node.disabled && !node.readOnly && node.getAttribute('aria-disabled') !== 'true');
  if (editors.length !== 1) return 'waiting';
  const editor = editors[0];
  if ((editor.value ?? editor.textContent ?? '').trim() || editor.querySelector('img, video, [data-mention]')) return 'draft';
  editor.focus();
  if (editor instanceof HTMLTextAreaElement) {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(editor, text);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    return editor.value === text ? 'filled' : 'waiting';
  }
  document.execCommand('insertText', false, text);
  return editor.innerText.trim() === text.trim() ? 'filled' : 'unverified';
}

chrome.runtime.onMessageExternal.addListener((message, sender, respond) => {
  if (!sender.url || message?.type !== 'prepare-handover' || typeof message.url !== 'string' ||
      typeof message.text !== 'string' || !message.text.trim() || message.text.length > 30000) {
    respond({ ok: false, error: 'Mensagem inválida.' });
    return;
  }
  prepare(message).then(() => respond({ ok: true }), error => respond({ ok: false, error: error.message }));
  return true;
});
