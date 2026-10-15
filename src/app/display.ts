import type { Position } from './models';

const labels: Record<string, string> = {
  waiting: '等待派車', planning: '規劃路線', pickup: '前往接人', transport: '載客行駛',
  completed: '完成', failed: '失敗', cancelled: '已取消', unconfirmed: '進度待確認',
};
export const statusLabel = (status?: string | null) => status ? labels[status] || status : '空閒';
export const pointLabel = (point?: Position | null) => point?.map(value => value.toFixed(5)).join(', ') || '—';
export const timeLabel = (value?: string | null) => value ? new Date(value).toLocaleTimeString('zh-TW', { hour12: false }) : '—';
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : '操作失敗';
export function parsePosition(text: string, label: string): Position {
  const parts = text.split(',').map(part => part.trim());
  const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  const point = parts.map(Number);
  if (parts.length !== 2 || !parts.every(part => numeric.test(part)) || !point.every(Number.isFinite)
    || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) throw new Error(`${label}請輸入有效的經度, 緯度。`);
  return point as Position;
}
