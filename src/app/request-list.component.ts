import { Component, input, inject } from '@angular/core';
import { SimulationService } from './simulation.service';
import { pointLabel, statusLabel } from './display';
import type { RideRequest } from './models';

@Component({
  selector: 'app-request-list',
  template: `
    <div class="record-list">
      @for (request of requests(); track request.id) {
        <article class="record-card">
          <div class="card-heading"><strong>{{ request.id }} · {{ request.passenger_count }} 人</strong><span class="badge">{{ label(request.status) }}</span></div>
          <p>上 {{ point(request.pickup) }} → 下 {{ point(request.destination) }}</p>
          @if (request.vehicle_id) {
            <p>{{ request.vehicle_id }}</p>
            @if (client.state().mode === 'monitor') { <button type="button" (click)="client.actions.selectVehicle(request.vehicle_id)">查看車輛</button> }
          }
          @if (request.failure_reason) { <p class="error-text">{{ request.failure_reason }}</p> }
          @if (client.state().mode === 'passenger' && client.state().canCancel && request.status === 'waiting') {
            <button type="button" (click)="cancel()">取消請求</button>
          }
        </article>
      } @empty { <p class="empty">尚無請求</p> }
    </div>
  `,
})
export class RequestListComponent {
  readonly requests = input.required<RideRequest[]>();
  readonly client = inject(SimulationService);
  readonly label = statusLabel;
  readonly point = pointLabel;
  async cancel() { try { await this.client.actions.cancelRequest(); } catch { /* 錯誤由狀態服務呈現。 */ } }
}
