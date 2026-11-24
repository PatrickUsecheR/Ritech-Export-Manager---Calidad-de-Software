/** Consulta pública de envíos y registro de eventos según los permisos del usuario. */

import { HttpErrorResponse } from '@angular/common/http';
import { CurrencyPipe, DatePipe, NgFor, NgIf } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../core/api.service';

interface TraceEvent {
  id?: number;
  titulo?: string;
  estado?: string;
  descripcion?: string;
  ubicacion?: string;
  fecha?: string;
  fecha_evento?: string;
}

interface TraceRecord {
  codigo_lote?: string;
  codigo_orden?: string;
  orden?: Record<string, unknown>;
  lote?: Record<string, unknown>;
  lotes?: Record<string, unknown>[];
  eventos?: TraceEvent[];
  certificaciones?: Record<string, unknown>[];
  [key: string]: unknown;
}

@Component({
  selector: 'app-traceability',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule, DatePipe, CurrencyPipe],
  template: `
    <section class="page trace-page">
      <div class="page-heading"><div><span class="eyebrow">{{ isAdmin ? 'CENTRO DE CONTROL' : 'TRANSPARENCIA DESDE EL ORIGEN' }}</span><h1>{{ isAdmin ? 'Gestión de trazabilidad' : 'Sigue el origen de tu producto' }}</h1><p>{{ isAdmin ? 'Registra hitos de calidad, procesamiento y envío de cada lote.' : 'Cada lote tiene una historia. Consulta el camino de tu café o cacao colombiano.' }}</p></div></div>
      <section class="lookup-card">
        <div class="lookup-icon">⌕</div>
        <div class="lookup-content"><label for="trace-code">{{ isAdmin ? 'Código de lote u orden a actualizar' : 'Código de lote u orden' }}</label>
          <div class="lookup-controls"><input id="trace-code" name="code" [(ngModel)]="code" (keyup.enter)="lookup()" placeholder="Ej. LOT-2026-CAF-001 o EXP-2026-001" autocomplete="off" /><button class="primary-button" (click)="lookup()" [disabled]="loading || !code.trim()">{{ loading ? 'Buscando…' : (isAdmin ? 'Consultar código' : 'Consultar origen') }} <span>→</span></button></div>
          <small>Consulta por código de lote (LOT-…) o código de orden (EXP-…).</small>
        </div>
      </section>
      <div class="alert error-alert" *ngIf="error">{{ error }}</div>
      <div class="trace-result" *ngIf="record">
        <div class="record-header"><div><span class="eyebrow">{{ record.codigo_orden ? 'ORDEN DE EXPORTACIÓN' : 'LOTE TRAZABLE' }}</span><h2>{{ record.codigo_orden || record.codigo_lote || code }}</h2><p *ngIf="record.lote">{{ value('tipo_producto') }} · {{ value('calidad') }}</p><p *ngIf="record.orden">{{ record.orden['cliente'] }} · envío {{ dateValue(record.orden['fecha_envio']) | date:'d MMM y' }}</p></div><span class="status-chip">{{ orderValue('estado') || value('estado') || 'En seguimiento' }}</span></div>
        <div class="record-stats" *ngIf="record.orden"><div><small>VALOR TOTAL EUR</small><strong>{{ currencyValue(record.orden['valor_total_eur']) | currency:'EUR':'symbol':'1.2-2' }}</strong></div><div><small>VALOR TOTAL COP</small><strong>{{ currencyValue(record.orden['valor_total_cop']) | currency:'COP':'symbol':'1.0-0' }}</strong></div><div><small>LOTES VINCULADOS</small><strong>{{ record.lotes?.length || 0 }}</strong></div></div>
        <div class="record-stats" *ngIf="record.lote && !record.orden"><div><small>PESO DISPONIBLE</small><strong>{{ value('peso_kg') || '—' }} <small>kg</small></strong></div><div><small>FECHA DE COSECHA</small><strong>{{ value('fecha_cosecha') | date:'d MMM y' }}</strong></div><div><small>CERTIFICACIONES</small><strong>{{ certificates.length }}</strong></div></div>
        <div class="trace-body">
          <section class="timeline-section"><div class="section-title"><div><h3>Historia del lote</h3><p>Un registro verificable de cada etapa del recorrido.</p></div><span class="event-count">{{ events.length }} HITOS</span></div>
            <div class="timeline">
              <article class="timeline-item" *ngFor="let event of events; let last = last" [class.last]="last">
                <span class="timeline-dot"></span><div class="event-content"><div class="event-top"><strong>{{ event.titulo || event.estado || 'Actualización de trazabilidad' }}</strong><time>{{ (event.fecha || event.fecha_evento) | date:'d MMM y, HH:mm' }}</time></div><p>{{ event.descripcion || 'Hito registrado para este lote.' }}</p><small *ngIf="event.ubicacion">⌖ {{ event.ubicacion }}</small></div>
              </article>
              <div class="empty-timeline" *ngIf="!events.length">No hay hitos publicados para este lote todavía.</div>
            </div>
            <section class="shipment-lots" *ngIf="record.lotes?.length"><h3>Lotes de la orden</h3><div *ngFor="let lot of record.lotes"><strong>{{ lot['codigo_lote'] }}</strong><span>{{ lot['tipo_producto'] }} · {{ lot['peso_kg'] }} kg · {{ lot['estado'] }}</span></div></section>
          </section>
          <aside class="certificate-panel"><h3>Certificaciones</h3><p>Documentos asociados al lote.</p><div class="certificate-item" *ngFor="let certificate of certificates"><span class="certificate-icon">▤</span><div><strong>{{ certificate['tipo_certificado'] || 'Certificación' }}</strong><small>Emitido {{ dateValue(certificate['fecha_expedicion']) | date:'d MMM y' }}</small></div><a *ngIf="certificate['archivo_pdf']" [href]="certificate['archivo_pdf']" target="_blank" rel="noopener" aria-label="Abrir certificado">↗</a></div><div *ngIf="!certificates.length" class="certificate-empty">Sin certificados registrados.</div></aside>
        </div>
        <section class="admin-tools" *ngIf="isAdmin">
          <div class="section-title"><div><h3>Actualizar recorrido</h3><p>Los hitos se asocian a la orden de exportación.</p></div></div>
          <form (ngSubmit)="addEvent()" #eventForm="ngForm" class="event-form">
            <label>Hito<select name="titulo" [(ngModel)]="newEvent.titulo" required><option value="">Selecciona etapa</option><option *ngFor="let stage of stages" [value]="stage">{{ stage }}</option></select></label>
            <label>Fecha y hora<input type="datetime-local" name="fecha" [(ngModel)]="newEvent.fecha" required /></label>
            <label>Ubicación<input name="ubicacion" [(ngModel)]="newEvent.ubicacion" required placeholder="Finca, planta, puerto…" /></label>
            <label class="description-field">Descripción<textarea name="descripcion" [(ngModel)]="newEvent.descripcion" rows="2" required placeholder="Detalle de la actividad realizada"></textarea></label>
            <button type="submit" class="primary-button" [disabled]="eventForm.invalid || saving">{{ saving ? 'Guardando…' : '＋ Registrar hito' }}</button>
          </form>
        </section>
      </div>
      <div class="first-lookup" *ngIf="!record && !error"><span>✦</span><h2>Una cadena transparente, de principio a fin.</h2><p>Consulta la cosecha, el control de calidad y las certificaciones que acompañan cada producto.</p></div>
    </section>
  `,
  styles: [`
    .page{max-width:1120px;margin:0 auto;padding:36px 38px 52px;color:#243b30}.page-heading{margin-bottom:24px}.eyebrow{font-size:10px;font-weight:700;letter-spacing:1.55px;color:#739551}.page-heading h1{font-size:29px;letter-spacing:-1px;margin:8px 0 6px;color:#19392d}.page-heading p{margin:0;color:#849087;font-size:12px}.lookup-card{background:#fff;border:1px solid #e6ece6;border-radius:10px;padding:21px;display:flex;gap:15px;align-items:flex-start}.lookup-icon{width:37px;height:37px;background:#eff5e9;border-radius:9px;color:#668a4a;font-size:23px;display:grid;place-items:center}.lookup-content{flex:1}.lookup-content>label{display:block;color:#30483a;font-weight:700;font-size:11px;margin:0 0 8px}.lookup-controls{display:flex;gap:9px}.lookup-controls input{height:39px;min-width:0;flex:1;border:1px solid #dfe6df;border-radius:6px;padding:0 12px;color:#334a3c;outline:none;font-size:12px}.lookup-controls input:focus{border-color:#7d9d64}.primary-button{background:#1b4935;color:#fff;border:0;border-radius:7px;padding:11px 15px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap}.primary-button:disabled{opacity:.55;cursor:not-allowed}.lookup-controls button span{padding-left:12px}.lookup-content>small{display:block;margin-top:8px;font-size:9px;color:#94a097}.error-alert{background:#fff0ee;color:#aa4035;padding:11px;border-radius:6px;font-size:12px;margin:13px 0}.trace-result{background:#fff;border:1px solid #e6ece6;border-radius:10px;margin-top:16px;overflow:hidden}.record-header{padding:21px 23px 15px;display:flex;justify-content:space-between;align-items:center}.record-header h2{color:#234133;font-size:22px;letter-spacing:-.4px;margin:6px 0}.record-header p{margin:0;color:#849087;font-size:11px}.status-chip{background:#edf5e9;color:#577846;border-radius:20px;padding:7px 10px;font-size:10px}.record-stats{display:grid;grid-template-columns:repeat(3,1fr);background:#f8faf8;border-top:1px solid #edf1ed;border-bottom:1px solid #edf1ed;padding:15px 23px}.record-stats>div{border-right:1px solid #e6ece6;padding-left:17px}.record-stats>div:first-child{padding-left:0}.record-stats>div:last-child{border:0}.record-stats small{display:block;color:#909b93;font-size:8px;letter-spacing:.7px}.record-stats strong{display:block;margin-top:6px;color:#304a3a;font-size:14px}.record-stats strong small{display:inline;font-size:10px;letter-spacing:0}.trace-body{display:grid;grid-template-columns:minmax(0,1.8fr) minmax(210px,1fr);gap:30px;padding:23px}.section-title{display:flex;justify-content:space-between;align-items:center}.section-title h3,.certificate-panel h3,.shipment-lots h3{margin:0;color:#284435;font-size:14px}.section-title p,.certificate-panel>p{margin:5px 0 0;color:#8b978e;font-size:10px}.event-count{font-size:8px;letter-spacing:.8px;color:#86938a}.timeline{margin-top:19px}.timeline-item{position:relative;display:flex;gap:13px;padding:0 0 19px 2px}.timeline-item:before{content:"";position:absolute;left:6px;top:14px;bottom:-2px;width:1px;background:#dce7d7}.timeline-item.last:before{display:none}.timeline-dot{position:relative;z-index:1;flex:0 0 11px;height:11px;border-radius:50%;background:#83a260;border:2px solid #edf4e7;margin-top:2px}.event-content{flex:1}.event-top{display:flex;justify-content:space-between;gap:9px}.event-top strong{font-size:11px;color:#36513e}.event-top time{color:#9aa59d;font-size:9px;white-space:nowrap}.event-content p{margin:6px 0;color:#718077;font-size:10px;line-height:1.55}.event-content>small{color:#8e9b91;font-size:9px}.shipment-lots{grid-column:1/-1;padding:13px 0 0;border-top:1px solid #edf1ed}.shipment-lots>div{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid #f0f3f0;font-size:10px}.shipment-lots strong{color:#405849}.shipment-lots span{color:#849087}.certificate-panel{border-left:1px solid #edf1ed;padding-left:22px}.certificate-panel>p{margin-bottom:17px}.certificate-item{display:flex;gap:9px;align-items:center;padding:11px 0;border-bottom:1px solid #f0f3f0}.certificate-icon{width:29px;height:29px;border-radius:7px;display:grid;place-items:center;background:#f4f2e7;color:#9c8954}.certificate-item>div{flex:1;min-width:0}.certificate-item strong,.certificate-item small{display:block}.certificate-item strong{font-size:10px;color:#405849}.certificate-item small{font-size:8px;color:#9aa59d;margin-top:4px}.certificate-item a{color:#658b4d;text-decoration:none}.certificate-empty,.empty-timeline{color:#9aa59d;font-size:10px;padding:12px 0}.admin-tools{padding:20px 23px 23px;background:#f9fbf8;border-top:1px solid #e9eee8}.event-form{display:grid;grid-template-columns:1fr 1fr;gap:13px;margin-top:16px;align-items:end}.event-form label{display:block;font-size:10px;font-weight:600;color:#405447}.event-form input,.event-form select,.event-form textarea{display:block;width:100%;margin-top:6px;border:1px solid #dfe6df;border-radius:6px;padding:9px 10px;font:inherit;font-weight:400;color:#334a3c;background:#fff}.description-field{grid-column:1/2}.event-form button{grid-column:2;justify-self:end}.first-lookup{text-align:center;padding:58px 25px;color:#849087}.first-lookup>span{display:inline-grid;place-items:center;width:42px;height:42px;border-radius:50%;background:#eff5e9;color:#6d8d4e;font-size:19px}.first-lookup h2{font-family:Georgia,serif;color:#3b5b43;font-size:22px;font-weight:400;margin:15px 0 7px}.first-lookup p{max-width:420px;margin:0 auto;font-size:11px;line-height:1.7}.alert.error-alert{margin-top:14px}
    @media(max-width:800px){.page{padding:28px 22px}.page h1{font-size:25px}.trace-body{grid-template-columns:1fr}.certificate-panel{border-left:0;border-top:1px solid #edf1ed;padding:20px 0 0}.record-stats{padding-left:18px;padding-right:18px}.record-stats>div{padding-left:12px}}@media(max-width:560px){.page{padding:22px 13px}.lookup-card{padding:14px;gap:10px}.lookup-controls{flex-direction:column}.lookup-controls button{width:100%}.record-header{padding:17px}.record-header h2{font-size:18px}.record-stats{padding:12px 8px}.record-stats>div{padding-left:7px}.record-stats small{font-size:7px}.record-stats strong{font-size:11px}.trace-body{padding:17px}.event-form{grid-template-columns:1fr}.description-field,.event-form button{grid-column:1}.event-form button{justify-self:stretch}.event-top{flex-direction:column;gap:4px}}
  `],
})
/** Busca lotes u órdenes y presenta eventos cronológicos y certificados asociados. */
export class TraceabilityComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  isAdmin = false;
  code = '';
  record: TraceRecord | null = null;
  loading = false;
  saving = false;
  error = '';
  readonly stages = ['Cosecha registrada', 'Control de calidad', 'Procesamiento', 'Empaque', 'Despacho', 'En tránsito', 'Entrega confirmada'];
  newEvent = { titulo: '', fecha: new Date().toISOString().slice(0, 16), ubicacion: '', descripcion: '' };

  get events(): TraceEvent[] {
    return [...(this.record?.eventos ?? [])].sort((a, b) => {
      const dateA = new Date(a.fecha || a.fecha_evento || 0).getTime();
      const dateB = new Date(b.fecha || b.fecha_evento || 0).getTime();
      return dateA - dateB;
    });
  }
  get certificates(): Record<string, unknown>[] {
    return this.record?.certificaciones ?? [];
  }

  ngOnInit(): void {
    this.route.data.subscribe((data) => this.isAdmin = Boolean(data['admin']));
    this.route.queryParamMap.subscribe((params) => {
      const code = params.get('code');
      if (code) {
        this.code = code;
        this.lookup();
      }
    });
  }

  lookup(): void {
    const code = this.code.trim();
    if (!code) return;
    this.loading = true;
    this.error = '';
    this.record = null;
    this.api.get<TraceRecord>(`trazabilidad/${encodeURIComponent(code)}/`).subscribe({
      next: (record) => { this.record = record; this.loading = false; },
      error: (error: HttpErrorResponse) => {
        this.loading = false;
        if (error.status === 404) this.error = 'No encontramos un lote ni una orden con ese código. Verifica el dato e inténtalo de nuevo.';
        else if (error.status === 0) this.error = 'No fue posible conectar con el servicio de trazabilidad.';
        else this.error = `No fue posible consultar el lote (${error.status}).`;
      },
    });
  }

  value(key: string): string {
    const value = this.record?.lote?.[key] ?? this.record?.[key];
    return value === undefined || value === null ? '' : String(value);
  }

  orderValue(key: string): string {
    const value = this.record?.orden?.[key];
    return value === undefined || value === null ? '' : String(value);
  }

  currencyValue(value: unknown): number | null {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  dateValue(value: unknown): string | number | Date | null {
    return typeof value === 'string' || typeof value === 'number' || value instanceof Date ? value : null;
  }

  addEvent(): void {
    if (!this.record || !this.code.trim()) return;
    this.saving = true;
    this.error = '';
    this.api.create<TraceRecord>(`trazabilidad/${encodeURIComponent(this.code.trim())}/eventos/`, {
      titulo: this.newEvent.titulo,
      fecha: new Date(this.newEvent.fecha).toISOString(),
      ubicacion: this.newEvent.ubicacion,
      descripcion: this.newEvent.descripcion,
    }).subscribe({
      next: () => {
        this.saving = false;
        this.newEvent = { titulo: '', fecha: new Date().toISOString().slice(0, 16), ubicacion: '', descripcion: '' };
        this.lookup();
      },
      error: (error: HttpErrorResponse) => {
        this.saving = false;
        this.error = error.status === 404
          ? 'El API aún no dispone de un endpoint de actualización de trazabilidad para este lote.'
          : `No se pudo registrar el hito (${error.status || 'sin conexión'}).`;
      },
    });
  }
}
