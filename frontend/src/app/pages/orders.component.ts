/** Gestión de órdenes, cálculo de cotizaciones EUR/COP y actualización de estados. */

import { HttpErrorResponse } from '@angular/common/http';
import { CurrencyPipe, DatePipe, DecimalPipe, NgFor, NgIf } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, catchError, of } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Client, ExportOrder, Lot, Product, RolePermission } from '../core/models';
import { calculateLineSubtotal, calculateOrderTotal, convertEurToCop } from '../core/order-pricing';

interface OrderLine {
  lote: number | '';
  cantidad_kg: number;
  precio_unitario_eur: number;
}

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule, CurrencyPipe, DatePipe, DecimalPipe],
  template: `
    <section class="page">
      <div class="page-heading"><div><span class="eyebrow">COMERCIO INTERNACIONAL</span><h1>Órdenes de exportación</h1><p>Cotiza, crea y sigue cada envío a tus clientes europeos.</p></div><button *ngIf="canCreateOrders" class="primary-button" (click)="openForm()">＋ Crear orden</button></div>
      <div class="summary-row">
        <div class="summary-card"><span>ÓRDENES REGISTRADAS</span><strong>{{ orders.length }}</strong></div>
        <div class="summary-card"><span>EN TRÁNSITO</span><strong>{{ countStatus('En tránsito') }}</strong></div>
        <div class="summary-card"><span>VALOR TOTAL EN EUR</span><strong>{{ totalEur | currency:'EUR':'symbol':'1.0-0' }}</strong></div>
        <div class="summary-card"><span>VALOR TOTAL EN COP</span><strong>{{ totalCop | currency:'COP':'symbol':'1.0-0' }}</strong></div>
      </div>
      <div class="alert error-alert" *ngIf="error">{{ error }}</div>
      <div class="panel table-panel"><div class="table-wrap"><table><thead><tr><th>ORDEN</th><th>CLIENTE</th><th>FECHA DE ENVÍO</th><th>DETALLE · EUR/KG</th><th>TOTAL EUR</th><th>TOTAL COP</th><th>ESTADO</th></tr></thead>
        <tbody><tr *ngFor="let order of orders"><td class="order-code">{{ order.codigo_orden }}</td><td>{{ order.cliente_nombre || clientName(order.cliente) }}</td><td>{{ order.fecha_envio | date:'d MMM y' }}</td><td><div class="detail-line" *ngFor="let detail of order.detalles">{{ detail.codigo_lote || ('Lote #' + detail.lote) }} · {{ detail.cantidad_kg | number:'1.2-2' }} kg × {{ detail.precio_unitario_eur | currency:'EUR':'symbol':'1.2-2' }} = {{ detail.subtotal_eur | currency:'EUR':'symbol':'1.2-2' }}</div></td><td>{{ order.valor_total_eur | currency:'EUR':'symbol':'1.2-2' }}</td><td>{{ order.valor_total_cop | currency:'COP':'symbol':'1.0-0' }}</td><td>
          <select class="status-select" [ngModel]="order.estado" (ngModelChange)="updateStatus(order, $event)" [disabled]="!canEditOrders">
            <option *ngFor="let status of orderStatuses" [value]="status">{{ status }}</option>
          </select>
        </td></tr><tr *ngIf="!orders.length"><td colspan="7" class="empty-state">{{ loading ? 'Cargando órdenes…' : 'Aún no hay órdenes. Crea una cotización a partir del inventario disponible.' }}</td></tr></tbody>
      </table></div></div>
      <div class="modal-backdrop" *ngIf="formOpen" (click)="closeOnBackdrop($event)">
        <section class="order-modal" role="dialog" aria-modal="true" aria-label="Crear orden de exportación">
          <div class="modal-header"><div><span class="eyebrow">NUEVA EXPORTACIÓN</span><h2>Arma tu orden</h2><p>Elige cliente, lotes y cantidades para calcular el valor al instante.</p></div><button class="close-button" (click)="formOpen = false" aria-label="Cerrar">×</button></div>
          <form (ngSubmit)="createOrder()" #orderForm="ngForm">
            <div class="form-grid">
              <label>Cliente UE<select name="cliente" [(ngModel)]="draft.cliente" required><option [ngValue]="''">Selecciona cliente</option><option *ngFor="let client of clients" [ngValue]="client.id">{{ client.razon_social }} · {{ client.pais_destino }}</option></select></label>
              <label>Fecha de envío<input type="date" name="fecha_envio" [(ngModel)]="draft.fecha_envio" required /></label>
            </div>
            <div class="exchange-control"><label>Tasa de cambio · COP/EUR<input type="number" min="1" step="0.01" [(ngModel)]="exchangeRate" name="exchangeRate" required /></label><small>Los precios por lote se precargan desde el catálogo y puedes ajustarlos para esta orden.</small></div>
            <div class="line-heading"><strong>Lotes para exportación</strong><button type="button" class="add-line" (click)="addLine()">＋ Añadir lote</button></div>
            <div class="lot-line" *ngFor="let line of draft.detalles; let i = index">
              <label class="lot-select">Lote<select [(ngModel)]="line.lote" [name]="'lote' + i" required (ngModelChange)="selectLotForLine(line)"><option [ngValue]="''">Selecciona lote disponible</option><option *ngFor="let lot of selectableLots(line)" [ngValue]="lot.id">{{ lot.codigo_lote }} · {{ lot.tipo_producto }} · {{ lot.peso_kg }} kg</option></select></label>
              <label class="quantity-select">Cantidad (kg)<input type="number" [(ngModel)]="line.cantidad_kg" [name]="'quantity' + i" min="0.01" step="0.01" [max]="selectedLot(line)?.peso_kg ?? null" required (ngModelChange)="recalculate()" /></label>
              <label class="price-select">EUR/kg<input type="number" [(ngModel)]="line.precio_unitario_eur" [name]="'price' + i" min="0" step="0.01" required (ngModelChange)="recalculate()" /><small class="line-subtotal">Subtotal {{ lineSubtotal(line) | currency:'EUR':'symbol':'1.2-2' }}</small></label>
              <button type="button" class="remove-line" aria-label="Eliminar lote" (click)="removeLine(i)" [disabled]="draft.detalles.length === 1">×</button>
            </div>
            <div class="totals-box"><div><span>Valor estimado</span><strong>{{ totalDraftEur | currency:'EUR':'symbol':'1.2-2' }}</strong></div><div><span>Equivalente aproximado</span><strong>{{ totalDraftCop | currency:'COP':'symbol':'1.0-0' }}</strong></div><small>La conversión usa la tasa de cambio indicada y puede variar.</small></div>
            <div class="alert error-alert" *ngIf="formError">{{ formError }}</div>
            <div class="modal-actions"><button type="button" class="secondary-button" (click)="formOpen = false">Cancelar</button><button type="submit" class="primary-button" [disabled]="orderForm.invalid || saving || !clients.length || !lots.length">{{ saving ? 'Creando…' : 'Confirmar orden' }}</button></div>
          </form>
        </section>
      </div>
    </section>
  `,
  styles: [`
    .page{max-width:1440px;margin:0 auto;padding:36px 38px 52px;color:#243b30}.page-heading{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:23px}.eyebrow{font-size:10px;font-weight:700;letter-spacing:1.55px;color:#739551}.page-heading h1{font-size:29px;letter-spacing:-1px;margin:8px 0 6px;color:#19392d}.page-heading p{margin:0;color:#849087;font-size:12px}.primary-button{background:#1b4935;color:#fff;border:0;border-radius:7px;padding:11px 15px;font-size:12px;font-weight:600;cursor:pointer}.primary-button:hover:not(:disabled){background:#286347}.primary-button:disabled{opacity:.55;cursor:not-allowed}.summary-row{display:grid;grid-template-columns:repeat(4,1fr);gap:13px;margin-bottom:17px}.summary-card{background:#fff;border:1px solid #e6ece6;border-radius:9px;padding:16px}.summary-card span,.summary-card strong{display:block}.summary-card span{font-size:9px;letter-spacing:.7px;color:#86938a;font-weight:700}.summary-card strong{font-size:20px;color:#254334;margin-top:8px;letter-spacing:-.4px}.panel{background:#fff;border:1px solid #e6ece6;border-radius:9px;overflow:hidden}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;white-space:nowrap}th{background:#f8faf8;color:#8d9990;font-size:9px;letter-spacing:.7px;text-align:left;padding:13px 15px;font-weight:700}td{padding:14px 15px;border-bottom:1px solid #eff2ef;color:#53645a;font-size:11px}.order-code{font-weight:700;color:#284638}.detail-line{padding:2px 0;font-size:9px;color:#718077}.status-select{border:1px solid #e3ebe1;background:#f3f7ef;border-radius:18px;padding:5px 8px;color:#557747;font-size:10px}.status-select:disabled{opacity:.8}.empty-state{text-align:center;padding:35px;color:#929e95}.error-alert{background:#fff0ee;color:#aa4035;padding:11px;border-radius:6px;font-size:12px;margin:0 0 13px}.modal-backdrop{position:fixed;inset:0;background:rgba(16,35,27,.44);z-index:10;display:grid;place-items:center;padding:20px}.order-modal{width:min(100%,720px);max-height:92vh;overflow:auto;background:white;border-radius:12px;padding:25px;box-shadow:0 20px 70px #102d2533}.modal-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:21px}.modal-header h2{color:#1e3d2e;font-size:22px;margin:7px 0 5px}.modal-header p{margin:0;color:#8a968e;font-size:11px}.close-button{background:#f2f5f2;border:0;border-radius:50%;width:30px;height:30px;color:#53645a;font-size:20px;cursor:pointer}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.order-modal label{display:block;color:#354b3e;font-weight:600;font-size:10px}.order-modal input,.order-modal select{display:block;width:100%;margin-top:7px;padding:10px 11px;background:#fff;border:1px solid #dfe6df;border-radius:6px;color:#30463a;font:inherit;font-weight:400;outline:none}.order-modal input:focus,.order-modal select:focus{border-color:#7d9d64}.exchange-control{display:flex;align-items:flex-end;gap:15px;margin:14px 0 20px;padding:13px;background:#f7f9f5;border-radius:8px}.exchange-control label{width:210px;flex:none}.exchange-control small{padding-bottom:10px;color:#85927c;font-size:9px}.line-heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;color:#304b39;font-size:12px}.add-line{border:0;background:transparent;color:#4d7947;font-weight:700;font-size:10px;cursor:pointer}.lot-line{display:grid;grid-template-columns:minmax(180px,1fr) 115px 110px 28px;gap:10px;align-items:end;margin-bottom:10px}.remove-line{width:27px;height:35px;border:0;border-radius:6px;background:#f8eeee;color:#a8554c;font-size:19px;cursor:pointer}.remove-line:disabled{opacity:.4}.line-subtotal{display:block;margin-top:6px;color:#6b8153;font-size:9px;font-weight:500}.totals-box{background:#eff5e9;border-radius:8px;padding:13px 15px;margin-top:15px;display:grid;grid-template-columns:1fr 1fr;gap:8px}.totals-box div span,.totals-box div strong{display:block}.totals-box div span{font-size:10px;color:#708167}.totals-box div strong{font-size:17px;color:#2d5438;margin-top:3px}.totals-box small{grid-column:1/-1;color:#85927c;font-size:9px}.modal-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:20px}.secondary-button{background:#fff;border:1px solid #dfe7df;border-radius:6px;color:#576b5e;padding:10px 13px;font-size:11px;cursor:pointer}
    @media(max-width:850px){.page{padding:28px 22px}.page-heading h1{font-size:25px}.summary-row{grid-template-columns:repeat(2,1fr)}}@media(max-width:650px){.page{padding:22px 13px}.page-heading{align-items:flex-start;gap:15px;flex-direction:column}.summary-row{gap:8px}.summary-card{padding:12px}.summary-card strong{font-size:17px}.form-grid{grid-template-columns:1fr}.exchange-control{align-items:stretch;flex-direction:column}.exchange-control label{width:auto}.exchange-control small{padding:0}.lot-line{grid-template-columns:minmax(130px,1fr) 90px 90px 26px;gap:6px}.order-modal{padding:18px}}
  `],
})
/** Carga datos de órdenes, aplica permisos y envía las órdenes en preparación. */
export class OrdersComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);
  orders: ExportOrder[] = [];
  lots: Lot[] = [];
  clients: Client[] = [];
  products: Product[] = [];
  readonly orderStatuses = ['Borrador', 'Confirmada', 'En tránsito', 'Entregada'];
  canCreateOrders = false;
  canEditOrders = false;
  exchangeRate = 4200;
  loading = false;
  saving = false;
  error = '';
  formError = '';
  formOpen = false;
  draft = this.emptyDraft();

  get totalEur(): number {
    return this.orders.reduce((sum, order) => sum + Number(order.valor_total_eur || 0), 0);
  }
  get totalCop(): number {
    return this.orders.reduce((sum, order) => sum + Number(order.valor_total_cop || 0), 0);
  }
  get totalDraftEur(): number {
    return calculateOrderTotal(this.draft.detalles.map((line) => ({
      quantityKg: line.cantidad_kg,
      unitPriceEur: line.precio_unitario_eur,
    })));
  }
  get totalDraftCop(): number {
    return convertEurToCop(this.totalDraftEur, Number(this.exchangeRate || 0));
  }

  lineSubtotal(line: OrderLine): number {
    return calculateLineSubtotal({
      quantityKg: line.cantidad_kg,
      unitPriceEur: line.precio_unitario_eur,
    });
  }

  ngOnInit(): void {
    if (this.auth.user()?.rol === 'Admin') {
      this.canCreateOrders = true;
      this.canEditOrders = true;
    } else {
      this.api.list<RolePermission>('permisos/mi-rol/').subscribe({
        next: (permissions) => {
          const orderPermission = permissions.find((permission) => permission.recurso === 'ordenes');
          this.canCreateOrders = !!orderPermission?.puede_crear;
          this.canEditOrders = !!orderPermission?.puede_editar;
        },
        error: (error: HttpErrorResponse) => {
          this.error = `No se pudieron consultar tus permisos (${error.status || 'sin conexión'}).`;
        },
      });
    }
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    forkJoin({
      orders: this.api.list<ExportOrder>('ordenes/').pipe(catchError(() => of([]))),
      lots: this.api.list<Lot>('lotes/').pipe(catchError(() => of([]))),
      clients: this.api.list<Client>('clientes/').pipe(catchError(() => of([]))),
      products: this.api.list<Product>('productos/').pipe(catchError(() => of([]))),
    }).subscribe((data) => {
      this.orders = data.orders;
      this.lots = data.lots;
      this.clients = data.clients;
      this.products = data.products;
      this.loading = false;
      if (!data.orders.length && !data.lots.length && !data.clients.length) {
        this.error = 'No se pudieron cargar los datos. Verifica que la API de Django esté disponible.';
      }
    });
  }

  countStatus(status: string): number {
    return this.orders.filter((order) => order.estado === status).length;
  }

  clientName(id: number): string {
    return this.clients.find((client) => client.id === id)?.razon_social ?? `Cliente #${id}`;
  }

  selectableLots(line: OrderLine): Lot[] {
    const selected = this.selectedLot(line);
    return this.lots.filter((lot) => {
      const stateAllows = lot.estado === 'Disponible' || lot.estado === 'Reservado';
      return stateAllows && (Number(lot.peso_kg) > 0) && (!this.draft.detalles.some((other) => other !== line && other.lote === lot.id) || selected?.id === lot.id);
    });
  }

  selectedLot(line: OrderLine): Lot | undefined {
    return this.lots.find((lot) => lot.id === Number(line.lote));
  }

  recalculate(): void {
    this.formError = '';
  }

  addLine(): void {
    this.draft.detalles.push({ lote: '', cantidad_kg: 1, precio_unitario_eur: 0 });
  }

  removeLine(index: number): void {
    if (this.draft.detalles.length > 1) this.draft.detalles.splice(index, 1);
    this.recalculate();
  }

  openForm(): void {
    this.draft = this.emptyDraft();
    this.formError = '';
    this.formOpen = true;
  }

  selectLotForLine(line: OrderLine): void {
    const lot = this.selectedLot(line);
    if (!lot) {
      line.precio_unitario_eur = 0;
      return;
    }
    const product = this.products.find((item) => item.id === lot.producto);
    line.precio_unitario_eur = Number(product?.precio_unitario_eur ?? (lot.tipo_producto === 'Café' ? 8.5 : 6.8));
    this.recalculate();
  }

  createOrder(): void {
    this.formError = '';
    if (this.draft.detalles.some((line) => !line.lote || !line.cantidad_kg || line.cantidad_kg <= 0)) {
      this.formError = 'Selecciona un lote y una cantidad válida para cada línea.';
      return;
    }
    const stockError = this.draft.detalles.find((line) => {
      const lot = this.selectedLot(line);
      return !lot || Number(line.cantidad_kg) > Number(lot.peso_kg);
    });
    if (stockError) {
      this.formError = `La cantidad supera el stock disponible de ${this.selectedLot(stockError)?.codigo_lote ?? 'un lote'}.`;
      return;
    }
    this.saving = true;
    this.api.create<ExportOrder>('ordenes/', {
      cliente: Number(this.draft.cliente),
      fecha_envio: this.draft.fecha_envio,
      valor_total_eur: this.totalDraftEur.toFixed(2),
      tasa_cambio_cop: Number(this.exchangeRate).toFixed(2),
      estado: 'Confirmada',
      detalles: this.draft.detalles.map((line) => ({
        lote: Number(line.lote),
        cantidad_kg: Number(line.cantidad_kg).toFixed(2),
        precio_unitario_eur: Number(line.precio_unitario_eur).toFixed(2),
      })),
    }).subscribe({
      next: () => { this.saving = false; this.formOpen = false; this.loadData(); },
      error: (error: HttpErrorResponse) => {
        this.saving = false;
        const detail = error.error?.detail;
        this.formError = typeof detail === 'string'
          ? detail
          : `No se pudo crear la orden (${error.status || 'sin conexión'}). Comprueba el cliente, los lotes y el stock.`;
      },
    });
  }

  updateStatus(order: ExportOrder, status: string): void {
    if (status === order.estado) return;
    this.api.update<ExportOrder>('ordenes/', order.id, { estado: status }).subscribe({
      next: (updated) => { this.orders = this.orders.map((item) => item.id === order.id ? { ...item, ...updated } : item); },
      error: (error: HttpErrorResponse) => this.error = `No se pudo actualizar el estado de ${order.codigo_orden} (${error.status || 'sin conexión'}).`,
    });
  }

  closeOnBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.formOpen = false;
  }

  private emptyDraft(): { cliente: number | ''; fecha_envio: string; detalles: OrderLine[] } {
    return { cliente: '', fecha_envio: new Date().toISOString().slice(0, 10), detalles: [{ lote: '', cantidad_kg: 1, precio_unitario_eur: 0 }] };
  }
}
