import { api, ApiError, button, el, formatDate } from './ui';
import type { Blessing } from './types';

export async function mountAdmin(root: HTMLElement) {
  root.className = 'admin-page';
  let records: Blessing[] = [], busy = false;
  function login(initialError = '') {
    root.replaceChildren();
    const form = el('form', 'admin-login'); form.append(el('h1', '', '管理员登录'));
    const label = el('label', 'field-label', '密码'); label.htmlFor = 'admin-password';
    const input = el('input', 'line-input'); input.id = 'admin-password'; input.type = 'password'; input.autocomplete = 'current-password'; input.required = true; input.maxLength = 256;
    const error = el('p', 'form-error', initialError); error.setAttribute('role', 'alert');
    const submit = el('button', 'text-button submit-button', '登录'); submit.type = 'submit';
    form.append(label, input, error, submit);
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (busy) return; busy = true; submit.disabled = true; error.textContent = '';
      try { await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: input.value }) }); input.value = ''; await load(); }
      catch (err) { error.textContent = (err as Error).message; }
      finally { busy = false; submit.disabled = false; }
    });
    root.append(form);
  }
  async function load() {
    try { const response = await api<{ blessings: Blessing[] }>('/api/admin/blessings'); records = response.blessings; render(); }
    catch (err) {
      if (err instanceof ApiError && err.status === 401) { login('请登录后继续'); return; }
      throw err;
    }
  }
  function render() {
    root.replaceChildren();
    const head = el('header', 'admin-head'); head.append(el('h1', '', '祝福管理'));
    const tools = el('div', 'admin-tools'), errors = el('p', 'form-error'); errors.setAttribute('role', 'alert');
    const refresh = button('刷新', async () => { refresh.disabled = true; try { await load(); } catch (err) { errors.textContent = (err as Error).message; } finally { refresh.disabled = false; } });
    const logout = button('退出登录', async () => {
      logout.disabled = true;
      try { await api('/api/admin/logout', { method: 'POST' }); login(); }
      catch (err) { errors.textContent = (err as Error).message; logout.disabled = false; }
    });
    tools.append(refresh, logout); head.append(tools); root.append(head, errors, el('p', 'admin-count', `共 ${records.length} 条祝福`));
    if (!records.length) { root.append(el('p', 'empty-state', '还没有人留下祝福。')); return; }
    const table = el('table', 'admin-table'); table.innerHTML = '<thead><tr><th scope="col">昵称</th><th scope="col">祝福</th><th scope="col">提交时间</th><th scope="col">操作</th></tr></thead>';
    const tbody = el('tbody');
    for (const row of records) {
      const tr = el('tr'), nickname = el('td', '', row.nickname || '匿名访客');
      nickname.append(el('small', 'mobile-date', formatDate(row.created_at)));
      const actions = el('td'); actions.append(button('删除', () => confirmDelete(row)));
      tr.append(nickname, el('td', 'table-message', row.message), el('td', '', formatDate(row.created_at)), actions); tbody.append(tr);
    }
    table.append(tbody); root.append(table);
  }
  function confirmDelete(record: Blessing) {
    const dialog = el('dialog', 'admin-confirm'); dialog.setAttribute('aria-labelledby', 'delete-title');
    const title = el('h2', '', '删除这条祝福？'); title.id = 'delete-title';
    const text = el('p', '', `${record.nickname || '匿名访客'}：${record.message}`);
    const note = el('p', '', '删除后，对应的祝福球也会消失。'), errors = el('p', 'form-error'); errors.setAttribute('role', 'alert');
    const actions = el('div', 'confirm-actions');
    const cancel = button('取消', () => dialog.close());
    const remove = button('删除', async () => {
      if (busy) return; busy = true; cancel.disabled = remove.disabled = true;
      try { await api(`/api/admin/blessings/${record.id}`, { method: 'DELETE' }); dialog.close(); await load(); }
      catch (err) { if (err instanceof ApiError && err.status === 401) { dialog.close(); login('登录已过期，请重新登录'); } else errors.textContent = (err as Error).message; }
      finally { busy = false; cancel.disabled = remove.disabled = false; }
    });
    actions.append(cancel, remove); dialog.append(title, text, note, errors, actions);
    dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    dialog.addEventListener('close', () => dialog.remove()); document.body.append(dialog); dialog.showModal();
  }
  try { await api('/api/admin/session'); await load(); }
  catch (err) { login(err instanceof ApiError && err.status === 401 ? '' : (err as Error).message); }
}
