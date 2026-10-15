import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, fromEvent, takeUntil } from 'rxjs';

export type ApiError = Error & { status?: number };

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  async request<T>(url: string, { method = 'GET', body, signal, timeout = 15000 }: {
    method?: string; body?: unknown; signal?: AbortSignal; timeout?: number;
  } = {}): Promise<T> {
    if (signal?.aborted) throw new DOMException('操作已中止', 'AbortError');
    try {
      const response = this.http.request<T>(method, url, { body, timeout, cache: 'no-store' });
      return await firstValueFrom(signal ? response.pipe(takeUntil(fromEvent(signal, 'abort'))) : response);
    } catch (error) {
      if (signal?.aborted) throw new DOMException('操作已中止', 'AbortError');
      if (!(error instanceof HttpErrorResponse)) throw error;
      const detail = error.error?.detail;
      const labels: Record<string, string> = { report_interval_seconds: '車輛回報間隔', poll_interval_seconds: '網頁更新間隔' };
      const message = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map(item => {
        const field = labels[item.loc?.at(-1)];
        if (field && item.type === 'greater_than_equal') return `${field}不得小於 0.1 秒。`;
        if (field && item.type === 'less_than_equal') return `${field}不得大於 60 秒。`;
        return String(item.msg || '設定無效').replace(/^Value error, /, '');
      }).join(' ') : error.status ? `HTTP ${error.status}` : 'Server 連線失敗或逾時。';
      throw Object.assign(new Error(message), { status: error.status });
    }
  }
}
