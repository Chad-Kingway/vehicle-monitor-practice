import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SimulationService } from './simulation.service';
import { RequestListComponent } from './request-list.component';
import { errorMessage, parsePosition, pointLabel, statusLabel, timeLabel } from './display';

@Component({
  selector: 'app-passenger', imports: [FormsModule, RequestListComponent],
  template: `
    <form class="passenger-form" ngNativeValidate (ngSubmit)="submit()">
      <h2>{{ !client.state().points.pickup ? '選取上車點' : !client.state().points.destination ? '選取下車點' : '確認乘車請求' }}</h2>
      <p>上車點 {{ point(client.state().points.pickup) }}</p><p>下車點 {{ point(client.state().points.destination) }}</p>
      <button type="button" (click)="reset()" [disabled]="!client.state().canEditTrip">重新選點</button>
      <label for="pickup-coordinate">上車點（經度, 緯度）</label><input id="pickup-coordinate" name="pickup" [(ngModel)]="pickup" [disabled]="!client.state().canEditTrip">
      <label for="destination-coordinate">下車點（經度, 緯度）</label><input id="destination-coordinate" name="destination" [(ngModel)]="destination" [disabled]="!client.state().canEditTrip">
      <button type="button" (click)="applyPoints()" [disabled]="!client.state().canEditTrip">套用座標</button>
      <label for="passenger-count">乘車人數</label><input id="passenger-count" name="count" type="number" min="1" step="1" required [(ngModel)]="count" [disabled]="!client.state().canEditTrip">
      <button type="submit" [disabled]="!client.state().canSubmit">送出請求</button>
      <button type="button" (click)="run(client.actions.submitRandomRequest)" [disabled]="!client.state().canEditTrip">隨機送出一筆</button>
      <p class="action-status" role="status">{{ localError() || (client.state().busy ? '處理中…' : client.state().pending ? '送出結果確認中…' : client.state().error || client.state().message) }}</p>
    </form>
    <section class="trip-progress"><p>{{ tripStatus() }}</p>
      @if (active() && client.state().selectedVehicle) { <label class="check-label"><input type="checkbox" [checked]="client.state().following" (change)="client.actions.follow($any($event.target).checked)">跟隨承接車</label> }
    </section>
    <section class="list-section"><h2>我的請求</h2><app-request-list [requests]="client.state().snapshot?.requests || []" /></section>
  `,
})
export class PassengerComponent {
  readonly client = inject(SimulationService);
  readonly localError = signal('');
  readonly point = pointLabel;
  count = 1;
  pickup = '';
  destination = '';
  private displayedRequestId: string | undefined;
  constructor() {
    effect(() => {
      const state = this.client.state();
      const request = state.currentRequest;
      if (request?.id !== this.displayedRequestId) { this.displayedRequestId = request?.id; if (request) this.count = request.passenger_count; }
    });
  }
  active() { return !!this.client.state().currentRequest && !['completed', 'failed', 'cancelled'].includes(this.client.state().currentRequest!.status); }
  reset() { this.client.actions.setPoints(); this.pickup = ''; this.destination = ''; this.localError.set(''); }
  applyPoints() {
    try { this.client.actions.setPoints({ pickup: parsePosition(this.pickup, '上車點'), destination: parsePosition(this.destination, '下車點') }); this.localError.set(''); }
    catch (error) { this.localError.set(errorMessage(error)); }
  }
  submit() { void this.run(() => this.client.actions.submitRequest(this.count)); }
  async run(operation: () => Promise<unknown>) {
    this.localError.set('');
    try { await operation(); }
    catch (error) { if (!this.client.state().pending && !this.client.state().error) this.localError.set(errorMessage(error)); }
  }
  tripStatus() {
    const state = this.client.state();
    const request = state.currentRequest;
    if (!request) return '尚無目前請求';
    const progress = Math.round((state.selectedTask?.progress || 0) * 100) + '%';
    if (request.status === 'unconfirmed') return `進度待確認 · ${statusLabel(state.selectedTask?.phase)} ${progress} · 最後回報 ${timeLabel(state.selectedVehicle?.last_report_at)}`;
    if (['pickup', 'transport'].includes(request.status)) return `${statusLabel(request.status)} · ${progress}`;
    return request.status === 'completed' ? '已送達' : statusLabel(request.status) + (request.failure_reason ? ' · ' + request.failure_reason : '');
  }
}
