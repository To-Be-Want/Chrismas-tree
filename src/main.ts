import './style.css';
import { TreeScene } from './scene';
import { api, button, el, icon } from './ui';
import type { Blessing, BlessingResponse } from './types';

const app = document.querySelector<HTMLElement>('#app')!;
if (/^\/admin\/?$/.test(location.pathname)) {
  import('./admin').then(({ mountAdmin }) => mountAdmin(app));
} else {
  mountTree();
}

function mountTree() {
  app.innerHTML = `<div id="world" class="world"><canvas id="universe" aria-label="粉白粒子圣诞树，单指旋转，双指缩放，点击白色祝福球查看祝福"></canvas>
    <button id="sound" class="icon-button sound-button" aria-label="播放音乐">${icon('mute')}</button>
    <div id="scene-notice" class="scene-notice" hidden></div>
    <div class="bottom-ui"><p id="gesture-hint" class="gesture-hint">单指旋转 <span>·</span> 双指缩放</p>
    <p id="connection" class="connection" aria-live="polite"></p><nav class="scene-actions" aria-label="祝福操作">
    <button id="write" class="scene-action">${icon('write')}<span>留个祝福</span></button><span class="action-divider"></span>
    <button id="all" class="scene-action">${icon('list')}<span>全部祝福</span></button></nav></div></div>
    <div id="overlay" class="overlay" hidden><div class="sheet-backdrop"></div><section id="sheet" class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabindex="-1"></section></div>
    <div id="toast" class="toast" role="status" aria-live="polite" hidden></div>`;
  const world = app.querySelector<HTMLElement>('#world')!;
  const canvas = app.querySelector<HTMLCanvasElement>('#universe')!;
  const overlay = app.querySelector<HTMLElement>('#overlay')!;
  const sheet = app.querySelector<HTMLElement>('#sheet')!;
  const connection = app.querySelector<HTMLElement>('#connection')!;
  const toastEl = app.querySelector<HTMLElement>('#toast')!;
  let tree: TreeScene | null = null;
  let records: Blessing[] = [], revision = -1, fetching = false, loaded = false, busy = false, syncFailed = false;
  let view: 'list' | 'detail' | 'form' | 'delete' | null = null, selectedId = '', fromList = false;
  let draft = { nickname: '', message: '' }, editingId = '';
  let returnFocus: HTMLElement | null = null, toastTimer = 0;
  const TOKEN_KEY = 'star-wishes:owners:v1';
  const PENDING_KEY = 'star-wishes:pending:v1';
  let ownership: Record<string, string> = {};
  try { ownership = JSON.parse(localStorage.getItem(TOKEN_KEY) || '{}'); } catch { /* User will be informed before submission if storage fails. */ }
  if (!ownership || typeof ownership !== 'object' || Array.isArray(ownership)) ownership = {};
  const owns = (id: string) => typeof ownership[id] === 'string';
  function toast(message: string) {
    clearTimeout(toastTimer); toastEl.textContent = message; toastEl.hidden = false;
    toastTimer = window.setTimeout(() => { toastEl.hidden = true; }, 3400);
  }
  try { tree = new TreeScene(canvas, id => openDetail(id, false)); }
  catch { showSceneError('当前浏览器无法显示3D场景，请尝试用手机系统浏览器打开。祝福功能仍可使用。'); }
  function showSceneError(message: string) { const notice = app.querySelector<HTMLElement>('#scene-notice')!; notice.textContent = message; notice.hidden = false; }
  canvas.addEventListener('scene-error', ((event: CustomEvent<string>) => showSceneError(event.detail)) as EventListener);

  function openSheet() {
    if (overlay.hidden) returnFocus = document.activeElement as HTMLElement;
    overlay.hidden = false; world.inert = true;
    requestAnimationFrame(() => sheet.focus());
  }
  function closeSheet() {
    if (busy) return;
    overlay.hidden = true; world.inert = false; view = null;
    returnFocus?.focus();
  }
  overlay.querySelector('.sheet-backdrop')!.addEventListener('click', closeSheet);
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeSheet();
    if (event.key !== 'Tab') return;
    const focusable = [...sheet.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, [tabindex="0"]')];
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === sheet)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  function header(title: string, back?: () => void) {
    sheet.replaceChildren();
    const head = el('header', 'sheet-head');
    if (back) { const b = button('返回', back, 'icon-button', 'back'); b.setAttribute('aria-label', '返回全部祝福'); head.append(b); }
    const h = el('h1', '', title); h.id = 'sheet-title'; head.append(h);
    const close = button('关闭', closeSheet, 'icon-button', 'close'); close.setAttribute('aria-label', '关闭窗口'); close.disabled = busy; head.append(close); sheet.append(head);
    return sheet;
  }
  function errorLine(message: string, parent: HTMLElement) { const line = el('p', 'form-error', message); line.setAttribute('role', 'alert'); parent.append(line); return line; }
  function openList() { view = 'list'; openSheet(); renderList(); void refresh(); }
  function renderList() {
    const body = header('全部祝福'), list = el('div', 'blessing-list');
    if (!loaded) list.append(el('p', 'empty-state', syncFailed ? '暂时无法读取祝福，请检查网络后重试。' : '正在寻找星光里的祝福…'));
    else if (!records.length) list.append(el('p', 'empty-state', '还没有祝福，来挂上第一颗祝福球吧。'));
    for (const row of records) {
      const item = button(row.nickname || '匿名访客', () => openDetail(row.id, true), 'blessing-row');
      item.append(el('span', 'row-chevron')); item.lastElementChild!.innerHTML = icon('chevron'); list.append(item);
    }
    body.append(list);
    if (!loaded) body.append(button('重新加载', () => void refresh(), 'text-button retry-button', 'retry'));
  }
  function openDetail(id: string, from: boolean) {
    selectedId = id; fromList = from; view = 'detail'; openSheet(); renderDetail();
  }
  function renderDetail() {
    const row = records.find(record => record.id === selectedId);
    if (!row) { closeSheet(); toast('这条祝福已经被删除'); return; }
    const body = header(row.nickname || '匿名访客', fromList ? openList : undefined);
    body.append(el('p', 'blessing-message', row.message));
    const actions = el('div', 'detail-actions');
    if (owns(row.id)) {
      actions.append(button('修改', () => openForm(row)), button('删除', () => openDelete(row.id)));
    }
    actions.append(button('定位到树上', () => { closeSheet(); tree?.focus(row.id); }, 'text-button locate-button', 'locate')); body.append(actions);
  }
  function openForm(record?: Blessing) {
    editingId = record?.id || ''; draft = { nickname: record?.nickname || '', message: record?.message || '' };
    view = 'form'; openSheet(); renderForm();
  }
  function renderForm() {
    const body = header(editingId ? '修改祝福' : '留个祝福'), form = el('form', 'blessing-form');
    const nicknameLabel = el('label', 'field-label', '昵称（选填）'); nicknameLabel.htmlFor = 'nickname';
    const nickname = el('input', 'line-input'); nickname.id = 'nickname'; nickname.name = 'nickname'; nickname.value = draft.nickname;
    nickname.maxLength = 40; nickname.setAttribute('autocomplete', 'nickname'); nickname.placeholder = '匿名访客';
    const messageLabel = el('label', 'field-label message-label', '祝福'); messageLabel.htmlFor = 'message';
    const message = el('textarea', 'message-input'); message.id = 'message'; message.name = 'message'; message.value = draft.message;
    message.maxLength = 400; message.rows = 4; message.required = true; message.placeholder = '把想说的话，留在星光里…';
    const counter = el('p', 'counter', `${[...draft.message].length}/200`);
    const notice = el('p', 'ownership-note', '无需登录。请在此浏览器修改或删除自己的祝福；清除缓存后无法找回编辑权限。');
    const errors = el('div', 'form-errors'); errors.setAttribute('aria-live', 'polite');
    const submit = el('button', 'text-button submit-button', editingId ? '保存修改' : '挂上祝福'); submit.type = 'submit';
    nickname.addEventListener('input', () => { draft.nickname = nickname.value; });
    message.addEventListener('input', () => { draft.message = message.value; const length = [...message.value].length; counter.textContent = `${length}/200`; counter.classList.toggle('over-limit', length > 200); });
    form.append(nicknameLabel, nickname, messageLabel, message, counter, notice, errors, submit);
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (busy) return; errors.replaceChildren();
      if ([...draft.nickname.trim()].length > 20) { errorLine('昵称最多20字', errors); nickname.focus(); return; }
      if (!draft.message.trim() || [...draft.message.trim()].length > 200) { errorLine('祝福请填写1到200字', errors); message.focus(); return; }
      let pending: { requestId: string; editToken: string } | undefined;
      if (!editingId) {
        try {
          const saved = localStorage.getItem(PENDING_KEY);
          pending = saved ? JSON.parse(saved) : { requestId: uuid(), editToken: token() };
          if (!pending || typeof pending.requestId !== 'string' || typeof pending.editToken !== 'string') throw new Error();
          localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
          localStorage.setItem(TOKEN_KEY, JSON.stringify(ownership));
        } catch { errorLine('浏览器未允许保存编辑凭证。请允许站点存储后再提交，方便你管理祝福。', errors); return; }
      }
      busy = true; submit.disabled = true; submit.textContent = '正在保存…';
      for (const close of sheet.querySelectorAll<HTMLButtonElement>('.sheet-head button')) close.disabled = true;
      try {
        const result = await api<{ blessing: Blessing; revision: number }>(editingId ? `/api/blessings/${editingId}` : '/api/blessings', {
          method: editingId ? 'PATCH' : 'POST', headers: editingId ? { 'X-Edit-Token': ownership[editingId] || '' } : {},
          body: JSON.stringify({ ...draft, ...(!editingId ? pending : {}) })
        });
        if (pending) {
          ownership[result.blessing.id] = pending.editToken;
          try { localStorage.setItem(TOKEN_KEY, JSON.stringify(ownership)); localStorage.removeItem(PENDING_KEY); }
          catch { toast('祝福已发布，但编辑凭证未能保存，请勿关闭本页'); }
        }
        // Force a fresh snapshot: another visitor may have published between polls.
        records = [result.blessing, ...records.filter(row => row.id !== result.blessing.id)];
        revision = -1; tree?.setBlessings(records, result.blessing.id);
        busy = false; closeSheet(); tree?.focus(result.blessing.id);
        toast(editingId ? '祝福已修改' : '已挂上你的祝福'); void refresh();
      } catch (error) {
        errorLine((error as Error).message, errors);
      } finally {
        busy = false; submit.disabled = false; submit.textContent = editingId ? '保存修改' : '挂上祝福';
        for (const close of sheet.querySelectorAll<HTMLButtonElement>('.sheet-head button')) close.disabled = false;
      }
    });
    body.append(form);
  }
  function openDelete(id: string) {
    selectedId = id; view = 'delete';
    const body = header('删除这条祝福？');
    body.append(el('p', 'delete-note', '删除后，对应的祝福球也会消失。'));
    const errors = el('div', 'form-errors'), actions = el('div', 'confirm-actions');
    const cancel = button('取消', () => { view = 'detail'; renderDetail(); });
    const confirm = button('删除', async () => {
      if (busy) return; busy = true; cancel.disabled = confirm.disabled = true; errors.replaceChildren();
      try {
        await api(`/api/blessings/${id}`, { method: 'DELETE', headers: { 'X-Edit-Token': ownership[id] || '' } });
        delete ownership[id]; try { localStorage.setItem(TOKEN_KEY, JSON.stringify(ownership)); } catch { /* Ownership is already revoked server-side. */ }
        records = records.filter(row => row.id !== id); revision = -1; tree?.setBlessings(records);
        busy = false; closeSheet(); toast('祝福已删除'); void refresh();
      } catch (error) { errorLine((error as Error).message, errors); }
      finally { busy = false; cancel.disabled = confirm.disabled = false; }
    });
    actions.append(cancel, confirm); body.append(errors, actions);
  }
  async function refresh() {
    if (fetching || document.hidden) return; fetching = true;
    try {
      const result = await api<BlessingResponse>(`/api/blessings?revision=${revision}`);
      if (!result.unchanged && result.blessings) { records = result.blessings; tree?.setBlessings(records, selectedId); }
      revision = result.revision; loaded = true; syncFailed = false; connection.replaceChildren();
      if (view === 'list') renderList();
      if (view === 'detail') renderDetail();
    } catch {
      syncFailed = true;
      connection.replaceChildren(el('span', '', '祝福暂未同步'), button('重试', () => void refresh(), 'inline-button'));
      if (view === 'list') renderList();
    } finally { fetching = false; }
  }
  app.querySelector('#write')!.addEventListener('click', () => openForm());
  app.querySelector('#all')!.addEventListener('click', openList);
  const hint = app.querySelector<HTMLElement>('#gesture-hint')!;
  setTimeout(() => hint.classList.add('is-faded'), 10000);
  void refresh(); setInterval(() => void refresh(), 15000);
  window.addEventListener('focus', () => void refresh());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });

  const audio = new Audio('/audio/christmas.m4a'); audio.loop = true; audio.preload = 'none'; audio.volume = .45;
  const sound = app.querySelector<HTMLButtonElement>('#sound')!;
  let wantsMusic = true, tried = false;
  function updateSound() { const playing = !audio.paused; sound.innerHTML = icon(playing ? 'sound' : 'mute'); sound.setAttribute('aria-label', playing ? '关闭音乐' : '播放音乐'); sound.setAttribute('aria-pressed', String(playing)); }
  async function playMusic(manual = false) {
    tried = true;
    try { await audio.play(); updateSound(); }
    catch { updateSound(); if (manual) toast('音乐暂时无法播放，请稍后重试'); }
  }
  sound.addEventListener('click', () => {
    if (!audio.paused) { wantsMusic = false; audio.pause(); updateSound(); }
    else { wantsMusic = true; void playMusic(true); }
  });
  world.addEventListener('pointerdown', event => {
    if (sound.contains(event.target as Node)) return;
    if (wantsMusic && !tried) void playMusic();
  });
  audio.addEventListener('pause', updateSound); audio.addEventListener('playing', updateSound);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audio.pause();
    else if (wantsMusic && tried) void playMusic();
  });
  document.addEventListener('WeixinJSBridgeReady', () => { if (wantsMusic) void playMusic(); }, { once: true });
  updateSound();
}

function token() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function uuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
  const hex = [...bytes].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
