import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, auditTime, concatMap, filter, from, catchError, EMPTY } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SimulationService } from './simulation.service';
import { errorMessage } from './display';

@Component({
  selector: 'app-settings', imports: [FormsModule],
  template: `
    <form class="speed-form" (submit)="$event.preventDefault()">
      <label>全車速度 <output>{{ speed() }}×</output><input type="range" min="1" max="300" step="1" aria-label="全車速度倍率"
        [value]="speed()" [disabled]="client.state().connection !== 'online'" (input)="changeSpeed(+$any($event.target).value)"></label>
      <p role="status">{{ speedMessage() }}</p>
    </form>
    <form class="interval-form" ngNativeValidate (ngSubmit)="saveIntervals()" (focusin)="editingIntervals = true" (focusout)="leaveIntervals($event)">
      <label>車輛回報間隔（秒）<input name="report" type="number" min="0.1" max="60" step="0.05" required [(ngModel)]="report"></label>
      <label>網頁更新間隔（秒）<input name="poll" type="number" min="0.1" max="60" step="0.05" required [(ngModel)]="poll"></label>
      <button type="submit" [disabled]="client.state().connection !== 'online' || client.state().busy">儲存設定</button>
      <p role="status">{{ intervalMessage() }}</p>
    </form>
    @if (client.state().snapshot; as data) {
      <dl class="settings">
        <div><dt>速度倍率</dt><dd id="speed">{{ data.settings.speed_multiplier }}×</dd></div>
        <div><dt>車輛回報</dt><dd>{{ data.settings.report_interval_seconds }} 秒</dd></div>
        <div><dt>網頁更新</dt><dd>{{ data.settings.poll_interval_seconds }} 秒</dd></div>
        <div><dt>模擬輪次</dt><dd [title]="data.run_id">{{ data.run_id.slice(0, 8) }}</dd></div>
      </dl>
    }
  `,
})
export class SettingsComponent {
  readonly client = inject(SimulationService);
  readonly speed = signal(60);
  readonly speedMessage = signal('');
  readonly intervalMessage = signal('');
  private readonly changes = new Subject<number>();
  private desiredSpeed: number | null = null;
  private sendingSpeed = false;
  report = 1;
  poll = 1;
  editingIntervals = false;

  constructor() {
    const destroyRef = inject(DestroyRef);
    effect(() => {
      const state = this.client.state();
      if (!state.snapshot) return;
      if (this.desiredSpeed === null && !this.sendingSpeed) this.speed.set(state.snapshot.settings.speed_multiplier);
      if (!this.editingIntervals && !state.busy) {
        this.report = state.snapshot.settings.report_interval_seconds;
        this.poll = state.snapshot.settings.poll_interval_seconds;
      }
      if (!state.busy && this.desiredSpeed !== null && state.connection === 'online') this.changes.next(this.desiredSpeed);
    });
    this.changes.pipe(
      auditTime(250),
      filter(() => !this.client.state().busy && this.client.state().connection === 'online'),
      concatMap(value => {
        this.desiredSpeed = null;
        this.sendingSpeed = true;
        return from(this.sendSpeed(value)).pipe(catchError(error => { this.speedMessage.set(errorMessage(error)); return EMPTY; }));
      }),
      takeUntilDestroyed(destroyRef),
    ).subscribe(() => this.speedMessage.set('已套用速度'));
    destroyRef.onDestroy(() => this.changes.complete());
  }
  changeSpeed(value: number) { this.speed.set(value); this.desiredSpeed = value; this.changes.next(value); }
  private async sendSpeed(value: number) {
    try { await this.client.actions.setSpeed(value); }
    finally { this.sendingSpeed = false; }
  }
  leaveIntervals(event: FocusEvent) { if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) this.editingIntervals = false; }
  async saveIntervals() {
    try { await this.client.actions.setIntervals(this.report, this.poll); this.intervalMessage.set('已儲存設定'); }
    catch (error) { this.intervalMessage.set(errorMessage(error)); }
  }
}
