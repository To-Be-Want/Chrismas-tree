export const icons: Record<string, string> = {
  write: '<path d="m16 3 5 5M4 16 16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-5 2z"/>',
  list: '<path d="M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01"/>',
  sound: '<path d="m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 4-6 5H2v6h3l6 5zM16 9l6 6M22 9l-6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  back: '<path d="m15 4-8 8 8 8"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  locate: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  retry: '<path d="M20 7V2l-4 4a8 8 0 1 0 3 12M20 2h-5"/>',
};
export function icon(name: string) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || ''}</svg>`; }
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.className = className; if (text !== undefined) node.textContent = text; return node;
}
export function button(label: string, action: () => void, className = 'text-button', iconName?: string) {
  const node = el('button', className); node.type = 'button';
  if (iconName) node.innerHTML = icon(iconName);
  node.append(el('span', '', label)); node.addEventListener('click', action); return node;
}
export function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short', hour12: false }).format(new Date(value));
}
export class ApiError extends Error {
  constructor(message: string, public status = 0) { super(message); }
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(path, { ...init, credentials: 'same-origin', signal: controller.signal,
      headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } });
    let data;
    try { data = await response.json(); } catch { throw new ApiError('服务暂时不可用，请稍后重试', response.status); }
    if (!response.ok) throw new ApiError(data.message || '操作未完成，请重试', response.status);
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(error instanceof Error && error.name === 'AbortError' ? '连接超时，请重试' : '网络连接失败，请检查网络后重试');
  } finally { clearTimeout(timeout); }
}
