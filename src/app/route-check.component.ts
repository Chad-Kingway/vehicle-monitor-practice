import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SimulationService } from './simulation.service';
import { parsePosition, errorMessage, pointLabel } from './display';

@Component({
  selector: 'app-route-check', imports: [FormsModule],
  template: `
    <section class="route-check" aria-labelledby="route-title">
      <h2 id="route-title">道路路線驗收</h2>
      <form id="route-form" ngNativeValidate (ngSubmit)="query()">
        <label for="route-origin">起點（經度, 緯度）</label><input id="route-origin" name="origin" required [(ngModel)]="origin">
        <label for="route-destination">終點（經度, 緯度）</label><input id="route-destination" name="destination" required [(ngModel)]="destination">
        <button id="route-submit" type="submit" [disabled]="client.state().busy || client.state().connection !== 'online'">查詢官方路線</button>
        <button type="button" (click)="clear()" [disabled]="client.state().busy">清除路線</button>
      </form>
      <p id="route-status" role="status">{{ message() || (client.state().route ? client.state().map.error || '已取得官方路線' : '尚未查詢') }}</p>
      @if (client.state().route; as route) {
        <dl id="route-result">
          <div><dt>距離</dt><dd>{{ route.distance_meters.toLocaleString('zh-TW') }} 公尺</dd></div>
          <div><dt>預估時間</dt><dd>{{ route.duration_seconds.toLocaleString('zh-TW') }} 秒</dd></div>
          <div><dt>道路座標</dt><dd>{{ route.coordinates.length }} 點</dd></div>
          <div><dt>道路起點</dt><dd>{{ point(route.coordinates[0]) }}</dd></div>
          <div><dt>道路終點</dt><dd>{{ point(route.coordinates.at(-1)) }}</dd></div>
        </dl>
      }
    </section>
  `,
})
export class RouteCheckComponent {
  readonly client = inject(SimulationService);
  readonly message = signal('');
  readonly point = pointLabel;
  origin = '121.561, 25.0334';
  destination = '121.517, 25.0478';
  clear() { this.client.actions.clearRoute(); this.message.set(''); }
  async query() {
    this.clear();
    try {
      const origin = parsePosition(this.origin, '起點');
      const destination = parsePosition(this.destination, '終點');
      this.message.set('向 Server 查詢…');
      await this.client.actions.queryRoute(origin, destination);
      this.message.set('');
    } catch (error) { this.message.set(errorMessage(error)); }
  }
}
