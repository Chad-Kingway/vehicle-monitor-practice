import { Component, computed, inject, signal } from '@angular/core';
import { SimulationService } from './simulation.service';
import { RequestListComponent } from './request-list.component';
import { SettingsComponent } from './settings.component';
import { RouteCheckComponent } from './route-check.component';
import { pointLabel, statusLabel, timeLabel } from './display';

@Component({
  selector: 'app-monitor', imports: [RequestListComponent, SettingsComponent, RouteCheckComponent],
  template: `
    <div class="summary" aria-label="車隊摘要"><span>在線 {{ online() }}</span><span>等待 {{ waiting() }}</span><span>送達 {{ completed() }}</span></div>
    <label class="search-label">搜尋<input type="search" aria-label="搜尋車輛與乘車請求" [value]="search()" (input)="search.set($any($event.target).value)"></label>
    <section class="list-section fleet-section"><h2>車隊</h2><div class="record-list">
      @for (vehicle of fleet(); track vehicle.id) {
        <button type="button" class="fleet-item" [class.selected]="vehicle.id === client.state().selectedVehicleId" (click)="client.actions.selectVehicle(vehicle.id)">
          <strong>{{ vehicle.id }}</strong><span>{{ vehicle.passenger_capacity }} 人 · {{ vehicle.connection_status === 'offline' ? '離線' : vehicleStatus(vehicle.task_id) }}</span>
        </button>
      } @empty { <p class="empty">尚無車輛</p> }
    </div></section>
    <section class="vehicle-card" aria-labelledby="vehicle-id">
      <div class="card-heading"><h2 id="vehicle-id">{{ client.state().selectedVehicle?.id || '車輛' }}</h2>
        <span class="badge" [attr.data-state]="client.state().selectedVehicle?.connection_status">{{ client.state().selectedVehicle?.connection_status === 'offline' ? '離線' : label(client.state().selectedTask?.status) }}</span></div>
      @if (client.state().selectedVehicle; as vehicle) {
        <dl>
          <div><dt>經度</dt><dd>{{ vehicle.position[0].toFixed(6) }}</dd></div><div><dt>緯度</dt><dd>{{ vehicle.position[1].toFixed(6) }}</dd></div>
          <div><dt>朝向</dt><dd>{{ vehicle.heading.toFixed(0) }}°</dd></div><div><dt>載客上限</dt><dd>{{ vehicle.passenger_capacity }} 人</dd></div>
          <div><dt>最後回報</dt><dd>{{ time(vehicle.last_report_at) }}</dd></div>
        </dl>
      }
      <div class="actions"><button type="button" (click)="client.actions.locate()" [disabled]="!client.state().selectedVehicle">定位</button>
        <label class="check-label"><input type="checkbox" [checked]="client.state().following" (change)="client.actions.follow($any($event.target).checked)">跟隨</label></div>
    </section>
    <section class="list-section request-section"><h2>乘車請求</h2><app-request-list [requests]="requests()" /></section>
    <section class="list-section task-section"><h2>接送任務</h2><div class="record-list">
      @for (task of client.state().snapshot?.tasks || []; track task.id) {
        <article class="record-card"><strong>{{ task.id }} · {{ task.vehicle_id }}</strong><p>{{ label(task.status) }} · {{ percent(task.progress) }}%</p>
          <progress max="1" [value]="task.progress" aria-label="接送進度"></progress>
          @if (task.status === 'unconfirmed') { <p>{{ label(task.phase) }}</p> }
        </article>
      } @empty { <p class="empty">尚無任務</p> }
    </div></section>
    <app-settings />
    @if (client.state().routeCheck) { <app-route-check /> }
  `,
})
export class MonitorComponent {
  readonly client = inject(SimulationService);
  readonly search = signal('');
  readonly label = statusLabel;
  readonly point = pointLabel;
  readonly time = timeLabel;
  readonly percent = (value: number) => Math.round(value * 100);
  readonly online = computed(() => this.client.state().snapshot?.vehicles.filter(v => v.connection_status === 'online').length || 0);
  readonly waiting = computed(() => this.client.state().snapshot?.requests.filter(r => r.status === 'waiting').length || 0);
  readonly completed = computed(() => this.client.state().snapshot?.requests.filter(r => r.status === 'completed').length || 0);
  readonly fleet = computed(() => this.client.state().snapshot?.vehicles.filter(v => v.id.toLowerCase().includes(this.search().trim().toLowerCase())) || []);
  readonly requests = computed(() => this.client.state().snapshot?.requests.filter(r => `${r.id} ${r.passenger_id} ${r.vehicle_id || ''} ${statusLabel(r.status)}`.toLowerCase().includes(this.search().trim().toLowerCase())) || []);
  vehicleStatus(id: string | null) { return statusLabel(this.client.state().snapshot?.tasks.find(t => t.id === id)?.status); }
}
