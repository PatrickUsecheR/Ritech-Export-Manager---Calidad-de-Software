/** Indicadores, órdenes recientes, inventario disponible y totales por país de destino. */

import { Component, inject, OnInit } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe, NgFor, NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Client, ExportOrder, Lot, RolePermission } from '../core/models';

interface DashboardSummary {
  valor_exportado_eur: string | number;
  ordenes_activas: number;
  ultimas_exportaciones: ExportOrder[];
  exportaciones_por_pais: {
    pais_destino: string;
    valor_total_eur: string | number;
    ordenes: number;
  }[];
  lotes: {
    total: number;
    peso_disponible_kg: string | number;
    por_estado: Record<string, number>;
  };
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [NgFor, NgIf, CurrencyPipe, DatePipe, DecimalPipe, RouterLink],
  template: `
    <section class="page dashboard-page">
      <div class="page-heading">
        <div><span class="eyebrow">VISTA GENERAL</span><h1>Buenos días, {{ firstName }} <span class="wave">✦</span></h1><p>El pulso de tus exportaciones, lotes y clientes en un solo lugar.</p></div>
        <a *ngIf="canCreateOrders" class="primary-button" routerLink="/orders">＋ Nueva orden</a>
      </div>
      <div class="alert error-alert" *ngIf="apiError">{{ apiError }}</div>
      <div class="metric-grid">
        <article class="metric-card"><div class="metric-top"><span>ÓRDENES ACTIVAS</span><span class="metric-icon purple">⇧</span></div><strong>{{ activeOrders }}</strong><div class="metric-bottom"><span class="trend">↗ {{ orders.length }} registradas</span><span>todas las órdenes</span></div></article>
        <article class="metric-card"><div class="metric-top"><span>INVENTARIO DISPONIBLE</span><span class="metric-icon green">▦</span></div><strong>{{ totalStock | number:'1.0-0' }} <small>kg</small></strong><div class="metric-bottom"><span class="trend">{{ availableLots }} lotes disponibles</span><span>café y cacao</span></div></article>
        <article class="metric-card"><div class="metric-top"><span>VALOR EXPORTADO</span><span class="metric-icon gold">€</span></div><strong>{{ exportedEur | currency:'EUR':'symbol':'1.0-0' }}</strong><div class="metric-bottom"><span class="trend">Valor total de órdenes</span><span>EUR</span></div></article>
        <article class="metric-card"><div class="metric-top"><span>CLIENTES UE</span><span class="metric-icon blue">◎</span></div><strong>{{ clients.length }}</strong><div class="metric-bottom"><span class="trend">{{ countriesCount }} países destino</span><span>destinos activos</span></div></article>
      </div>
      <div class="dashboard-grid">
        <section class="panel orders-panel">
          <div class="panel-heading"><div><h2>Órdenes recientes</h2><p>Seguimiento de tus últimos envíos</p></div><a routerLink="/orders">Ver todas <span>→</span></a></div>
          <div class="table-wrap">
            <table><thead><tr><th>ORDEN</th><th>CLIENTE</th><th>FECHA DE ENVÍO</th><th>VALOR</th><th>ESTADO</th></tr></thead>
              <tbody><tr *ngFor="let order of recentOrders"><td class="code">{{ order.codigo_orden }}</td><td>{{ order.cliente_nombre || clientName(order.cliente) }}</td><td>{{ order.fecha_envio | date:'d MMM y' }}</td><td>{{ order.valor_total_eur | currency:'EUR':'symbol':'1.0-0' }}</td><td><span class="status" [class]="statusClass(order.estado)">{{ order.estado }}</span></td></tr>
                <tr *ngIf="!recentOrders.length"><td colspan="5" class="empty-state">Todavía no hay órdenes registradas.</td></tr></tbody>
            </table>
          </div>
        </section>
        <section class="panel inventory-panel">
          <div class="panel-heading"><div><h2>Disponibilidad de inventario</h2><p>Stock actual por producto</p></div><a routerLink="/inventory">Ver lotes <span>→</span></a></div>
          <div class="stock-item" *ngFor="let stock of productStock">
            <div class="stock-title"><span class="product-dot" [class.cacao-dot]="stock.name === 'Cacao'"></span><strong>{{ stock.name }}</strong><span>{{ stock.kilos | number:'1.0-0' }} kg</span></div>
            <div class="stock-track"><span [style.width.%]="stock.share"></span></div>
            <small>{{ stock.lots }} lotes disponibles</small>
          </div>
          <div class="inventory-callout"><span>✦</span><div><strong>{{ lots.length }} lotes en seguimiento</strong><small>Revisa certificados y trazabilidad.</small></div></div>
        </section>
        <section class="panel country-panel">
          <div class="panel-heading"><div><h2>Exportaciones por país</h2><p>Valor de los envíos confirmados y entregados</p></div></div>
          <div class="country-row" *ngFor="let country of countryExports">
            <div class="country-label"><strong>{{ country.pais_destino }}</strong><span>{{ country.valor_total_eur | currency:'EUR':'symbol':'1.0-0' }}</span></div>
            <div class="stock-track"><span [style.width.%]="countryShare(country.valor_total_eur)"></span></div>
            <small>{{ country.ordenes }} órdenes</small>
          </div>
          <p *ngIf="!countryExports.length" class="country-empty">Aún no hay exportaciones para mostrar.</p>
        </section>
      </div>
    </section>
  `,
  styles: [`
    .page{max-width:1440px;margin:0 auto;padding:36px 38px 52px;color:#223a2e}.page-heading{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:25px}.page-heading h1{font-size:29px;letter-spacing:-1.1px;margin:8px 0 6px;color:#19392d}.page-heading p,.panel-heading p{margin:0;color:#829087;font-size:12px}.wave{font-size:17px;color:#d0a954}.primary-button{background:#1b4935;color:#fff;border:0;border-radius:7px;padding:11px 15px;text-decoration:none;font-size:12px;font-weight:600;cursor:pointer}.metric-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:15px}.metric-card,.panel{background:#fff;border:1px solid #e8eee8;border-radius:10px}.metric-card{padding:18px 19px 15px;min-height:133px}.metric-top{display:flex;align-items:center;justify-content:space-between;color:#86938a;font-size:9px;font-weight:700;letter-spacing:.8px}.metric-icon{width:29px;height:29px;border-radius:8px;display:grid;place-items:center;font-size:15px}.purple{background:#f1edfc;color:#8565bb}.green{background:#edf5e6;color:#648a40}.gold{background:#fcf4e3;color:#b48d37}.blue{background:#e8f1f3;color:#4b8187}.metric-card>strong{display:block;color:#213b2e;font-size:26px;letter-spacing:-1px;margin:10px 0 9px}.metric-card>strong small{font-size:12px;color:#87938b;font-weight:500;letter-spacing:0}.metric-bottom{display:flex;justify-content:space-between;color:#9aa59d;font-size:9px}.trend{color:#578151}.dashboard-grid{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(270px,1fr);gap:16px;margin-top:17px}.panel{padding:20px 0 8px;overflow:hidden}.panel-heading{display:flex;justify-content:space-between;align-items:center;padding:0 20px 18px}.panel-heading h2{font-size:14px;margin:0 0 5px;color:#263e32}.panel-heading a{color:#537d4a;text-decoration:none;font-size:10px;font-weight:600}.panel-heading a span{padding-left:5px}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;white-space:nowrap}th{text-align:left;background:#f8faf8;color:#98a29b;font-size:8px;letter-spacing:.7px;padding:11px 16px;font-weight:700}td{padding:13px 16px;border-bottom:1px solid #f0f3f0;color:#607067;font-size:10px}td.code{font-weight:700;color:#284638}.status{border-radius:20px;padding:5px 8px;font-size:9px;color:#56794a;background:#edf5e9}.status.transit{background:#eaf1fa;color:#5479aa}.status.delivered{background:#edf3ef;color:#648071}.status.draft{background:#f8f2e7;color:#9b7a39}.empty-state{text-align:center;padding:30px;color:#9aa59d}.inventory-panel{padding-bottom:17px}.stock-item{padding:8px 20px 14px}.stock-title{display:flex;align-items:center;gap:8px;font-size:11px}.stock-title strong{font-weight:600}.stock-title>span:last-child{margin-left:auto;color:#53645a;font-weight:600}.product-dot{width:8px;height:8px;border-radius:50%;background:#789a56}.cacao-dot{background:#a7804d}.stock-track{height:5px;border-radius:6px;background:#eef2ec;margin:10px 0 6px;overflow:hidden}.stock-track span{height:100%;display:block;border-radius:6px;background:#88a766}.stock-item small{font-size:9px;color:#98a39a}    .inventory-callout{margin:10px 20px 0;padding:13px 12px;background:#f7f9f4;border-radius:7px;display:flex;gap:10px;align-items:center;color:#799453}.inventory-callout>span{font-size:16px}.inventory-callout strong,.inventory-callout small{display:block}.inventory-callout strong{font-size:10px;color:#496341}.inventory-callout small{font-size:9px;color:#8f9c90;margin-top:4px}.error-alert{background:#fff0ee;color:#aa4035;padding:11px;border-radius:6px;font-size:12px;margin:0 0 14px}.country-panel{grid-column:1/-1}.country-row{padding:7px 20px 12px}.country-label{display:flex;justify-content:space-between;color:#43594a;font-size:11px}.country-label span{font-weight:600}.country-row small,.country-empty{color:#98a39a;font-size:9px}.country-empty{padding:0 20px 12px}
    @media(max-width:1100px){.page{padding:28px 22px}.metric-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:760px){.dashboard-grid{grid-template-columns:1fr}.page-heading{align-items:flex-start;gap:16px;flex-direction:column}.page-heading h1{font-size:25px}}@media(max-width:470px){.page{padding:22px 13px}.metric-grid{gap:9px}.metric-card{padding:13px;min-height:125px}.metric-bottom{flex-direction:column;gap:4px}.page-heading h1{font-size:23px}}
  `],
})
/** Carga datos del panel y calcula los valores de las tarjetas de resumen. */
export class DashboardComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);
  lots: Lot[] = [];
  orders: ExportOrder[] = [];
  clients: Client[] = [];
  summary: DashboardSummary | null = null;
  apiError = '';

  get activeOrders(): number {
    return this.summary?.ordenes_activas
      ?? this.orders.filter((order) => !['Entregada', 'Cancelada'].includes(order.estado)).length;
  }
  get firstName(): string {
    return this.auth.user()?.nombre.split(' ')[0] ?? 'equipo';
  }
  canCreateOrders = false;
  get totalStock(): number {
    return Number(this.summary?.lotes.peso_disponible_kg
      ?? this.lots.reduce((total, lot) => total + Number(lot.peso_kg || 0), 0));
  }
  get availableLots(): number {
    return this.summary?.lotes.por_estado['Disponible']
      ?? this.lots.filter((lot) => lot.estado === 'Disponible').length;
  }
  get exportedEur(): number {
    return Number(this.summary?.valor_exportado_eur
      ?? this.orders.reduce((total, order) => total + Number(order.valor_total_eur || 0), 0));
  }
  get countriesCount(): number {
    return this.summary?.exportaciones_por_pais.length
      ?? new Set(this.clients.map((client) => client.pais_destino)).size;
  }
  get recentOrders(): ExportOrder[] {
    return this.summary?.ultimas_exportaciones
      ?? [...this.orders].sort((a, b) => b.id - a.id).slice(0, 5);
  }
  get countryExports(): DashboardSummary['exportaciones_por_pais'] {
    return this.summary?.exportaciones_por_pais ?? [];
  }
  get productStock(): { name: string; kilos: number; lots: number; share: number }[] {
    const groups = ['Café', 'Cacao'].map((name) => {
      const matching = this.lots.filter((lot) => lot.tipo_producto === name && lot.estado === 'Disponible');
      return { name, kilos: matching.reduce((sum, lot) => sum + Number(lot.peso_kg || 0), 0), lots: matching.length, share: 0 };
    });
    const max = Math.max(...groups.map((item) => item.kilos), 1);
    return groups.map((item) => ({ ...item, share: (item.kilos / max) * 100 }));
  }

  ngOnInit(): void {
    if (this.auth.user()?.rol === 'Admin') {
      this.canCreateOrders = true;
    } else {
      this.api.list<RolePermission>('permisos/mi-rol/').subscribe({
        next: (permissions) => {
          this.canCreateOrders = !!permissions.find(
            (permission) => permission.recurso === 'ordenes',
          )?.puede_crear;
        },
        error: (error) => {
          this.apiError = `No se pudieron consultar tus permisos (${error.status || 'sin conexión'}).`;
        },
      });
    }
    forkJoin({
      lots: this.api.list<Lot>('lotes/').pipe(catchError(() => of([]))),
      orders: this.api.list<ExportOrder>('ordenes/').pipe(catchError(() => of([]))),
      clients: this.api.list<Client>('clientes/').pipe(catchError(() => of([]))),
      summary: this.api.get<DashboardSummary>('dashboard/').pipe(catchError(() => of(null))),
    }).subscribe((data) => {
      this.lots = data.lots;
      this.orders = data.orders;
      this.clients = data.clients;
      this.summary = data.summary;
      if (!this.summary && !data.lots.length && !data.orders.length && !data.clients.length) {
        this.apiError = 'No hay datos de la API disponibles. Verifica la conexión del servidor.';
      }
    });
  }

  clientName(id: number): string {
    return this.clients.find((client) => client.id === id)?.razon_social ?? `Cliente #${id}`;
  }

  statusClass(status: string): string {
    if (status === 'En tránsito') return 'status transit';
    if (status === 'Entregada') return 'status delivered';
    if (status === 'Borrador') return 'status draft';
    return 'status';
  }

  countryShare(value: string | number): number {
    const largest = Math.max(
      ...this.countryExports.map((country) => Number(country.valor_total_eur)),
      1,
    );
    return Math.max((Number(value) / largest) * 100, 4);
  }
}
