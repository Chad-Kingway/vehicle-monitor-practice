import { Component, ElementRef, ViewChild, afterNextRender, inject } from '@angular/core';
import { SimulationService } from './simulation.service';
import { MonitorComponent } from './monitor.component';
import { PassengerComponent } from './passenger.component';

@Component({
  selector: 'app-root', imports: [MonitorComponent, PassengerComponent], providers: [SimulationService],
  template: `
    <main class="monitor">
      <aside class="panel" [attr.aria-label]="client.state().mode === 'monitor' ? '車輛監控資料' : '乘客叫車資料'">
        <header><span class="eyebrow">{{ client.state().mode === 'monitor' ? 'VEHICLE MONITOR' : 'PASSENGER' }}</span>
          <h1>{{ client.state().mode === 'monitor' ? '車輛監控' : '乘客叫車' }}</h1>
          <p id="connection" class="connection" role="status" [attr.data-state]="client.state().connection === 'online' ? 'online' : 'offline'">{{ connectionText() }}</p>
          @if (client.state().mode === 'monitor') {
            <a class="button-link" [href]="passengerLink" target="_blank" rel="noopener" (click)="refreshLink(false, $event)" (auxclick)="refreshLink(false, $event)">新增乘客</a>
            <a class="button-link" [href]="randomLink" target="_blank" rel="noopener" (click)="refreshLink(true, $event)" (auxclick)="refreshLink(true, $event)">隨機送出一筆</a>
          } @else { <p class="identity" [title]="client.state().passengerId || ''">乘客 {{ client.state().passengerId?.slice(0, 8) }}</p> }
        </header>
        @if (client.state().mode === 'monitor') { <app-monitor /> } @else { <app-passenger /> }
        <footer><p id="map-status" role="status">{{ client.state().map.message || '載入地圖…' }}</p>
          @if (client.state().map.error) { <p id="map-error" role="alert">{{ client.state().map.error }}</p> }
          @if (client.state().mode === 'monitor' && client.state().error) { <p class="error-text" role="alert">{{ client.state().error }}</p> }
        </footer>
      </aside>
      <section class="map-region" aria-label="勤崴監控地圖">
        <div #map id="map" aria-label="車輛位置與朝向"></div>
        <span class="map-caption">{{ client.state().mode === 'monitor' ? '勤崴地圖 · 3D 車輛' : '依序選取上車、下車點' }}</span>
        @if (client.state().map.status === 'loading') { <div class="map-loading" role="status">{{ client.state().map.message }}</div> }
        <div class="map-controls">
          <button type="button" [disabled]="client.state().map.status !== 'ready' || client.state().map.preferences?.poiDisabled" (click)="togglePoi()">POI：{{ client.state().map.preferences?.poi === false ? '隱藏' : '顯示' }}</button>
          <label class="map-scale-control">模型比例<input type="range" min="1" max="100" step="1" aria-label="模型比例"
            [value]="client.state().map.preferences?.scale || 30" [disabled]="client.state().map.status !== 'ready' || client.state().map.preferences?.scaleDisabled"
            (input)="setScale(+$any($event.target).value)"><output>{{ client.state().map.preferences?.scale || 30 }}</output></label>
          <span class="map-preference-status" role="status">{{ client.state().map.preferences?.error }}</span>
        </div>
      </section>
    </main>
  `,
})
export class WorkspaceComponent {
  readonly client = inject(SimulationService);
  @ViewChild('map', { static: true }) private map!: ElementRef<HTMLElement>;
  passengerLink = this.client.passengerUrl();
  randomLink = this.client.passengerUrl({ random: true });
  constructor() {
    document.title = this.client.state().mode === 'monitor' ? '車輛監控' : '乘客叫車';
    afterNextRender(() => { this.client.start(); void this.client.mountMap(this.map.nativeElement).catch(() => {}); });
  }
  refreshLink(random: boolean, event: MouseEvent) {
    const value = this.client.passengerUrl({ random });
    if (random) this.randomLink = value; else this.passengerLink = value;
    (event.currentTarget as HTMLAnchorElement).href = value;
  }
  connectionText() { const connection = this.client.state().connection; return connection === 'online' ? 'Server 已連線' : connection === 'offline' ? 'Server 連線中斷' : '連線中…'; }
  togglePoi() { try { this.client.actions.setMapPreferences({ poi: !this.client.state().map.preferences?.poi }); } catch { /* 地圖錯誤由服務呈現。 */ } }
  setScale(scale: number) { try { this.client.actions.setMapPreferences({ scale }); } catch { /* 地圖錯誤由服務呈現。 */ } }
}
