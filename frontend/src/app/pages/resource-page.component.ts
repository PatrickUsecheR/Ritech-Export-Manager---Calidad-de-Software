/** Vistas CRUD reutilizables, basadas en metadatos, para catálogo e inventario. */

import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit } from '@angular/core';
import { DecimalPipe, NgFor, NgIf, NgSwitch, NgSwitchCase, NgSwitchDefault } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Lot, Product, RolePermission, Supplier } from '../core/models';
import { validateCertificateFile } from '../core/certificate-validation';

type FieldKind = 'text' | 'email' | 'number' | 'date' | 'select' | 'file' | 'password' | 'textarea' | 'checkbox';
type RemoteResource = 'proveedores' | 'productos' | 'lotes';

interface SelectOption {
  value: string | number;
  label: string;
}

interface ResourceField {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  options?: string[];
  source?: RemoteResource;
  json?: boolean;
  min?: number;
  step?: number;
  hint?: string;
}

interface ResourceDefinition {
  title: string;
  description: string;
  api: string;
  fields: ResourceField[];
  columns: { key: string; label: string }[];
  createLabel: string;
}

const RESOURCES: Record<string, ResourceDefinition> = {
  users: {
    title: 'Usuarios',
    description: 'Controla los accesos y roles de las personas en tu equipo.',
    api: 'usuarios/',
    createLabel: 'Nuevo usuario',
    fields: [
      { key: 'nombre', label: 'Nombre completo', kind: 'text', required: true },
      { key: 'email', label: 'Correo electrónico', kind: 'email', required: true },
      { key: 'password', label: 'Contraseña', kind: 'password', required: true, hint: 'Mínimo 8 caracteres.' },
      { key: 'rol', label: 'Rol', kind: 'select', required: true, options: ['Admin', 'Analista', 'Calidad', 'Cliente'] },
      { key: 'is_active', label: 'Cuenta activa', kind: 'checkbox' },
      { key: 'is_staff', label: 'Acceso al administrador Django', kind: 'checkbox' },
      { key: 'is_superuser', label: 'Superusuario', kind: 'checkbox' },
      { key: 'permisos_personalizados', label: 'Permisos personalizados (JSON)', kind: 'textarea', json: true, hint: 'Opcional. Ej.: {"lotes":{"puede_leer":true,"puede_crear":false}}' },
    ],
    columns: [{ key: 'nombre', label: 'NOMBRE' }, { key: 'email', label: 'CORREO' }, { key: 'rol', label: 'ROL' }, { key: 'is_active', label: 'ACTIVO' }],
  },
  products: {
    title: 'Productos',
    description: 'Mantén actualizado el catálogo de productos de exportación.',
    api: 'productos/',
    createLabel: 'Nuevo producto',
    fields: [
      { key: 'nombre', label: 'Nombre del producto', kind: 'text', required: true },
      { key: 'tipo_producto', label: 'Tipo', kind: 'select', required: true, options: ['Café', 'Cacao'] },
      { key: 'descripcion', label: 'Descripción', kind: 'textarea' },
      { key: 'precio_unitario_eur', label: 'Precio de referencia (EUR/kg)', kind: 'number', min: 0, step: 0.01 },
      { key: 'activo', label: 'Estado', kind: 'select', options: ['Activo', 'Inactivo'] },
    ],
    columns: [{ key: 'nombre', label: 'PRODUCTO' }, { key: 'tipo_producto', label: 'TIPO' }, { key: 'precio_unitario_eur', label: 'PRECIO EUR/KG' }, { key: 'activo', label: 'ESTADO' }],
  },
  suppliers: {
    title: 'Proveedores',
    description: 'Administra productores y proveedores vinculados al origen.',
    api: 'proveedores/',
    createLabel: 'Nuevo proveedor',
    fields: [
      { key: 'razon_social', label: 'Razón social', kind: 'text', required: true },
      { key: 'nit', label: 'NIT / identificación', kind: 'text', required: true },
      { key: 'contacto', label: 'Persona de contacto', kind: 'text' },
      { key: 'email', label: 'Correo electrónico', kind: 'email' },
      { key: 'telefono', label: 'Teléfono', kind: 'text' },
      { key: 'direccion', label: 'Dirección', kind: 'text' },
      { key: 'municipio_origen', label: 'Municipio de origen', kind: 'text' },
    ],
    columns: [{ key: 'razon_social', label: 'PROVEEDOR' }, { key: 'nit', label: 'IDENTIFICACIÓN' }, { key: 'municipio_origen', label: 'MUNICIPIO DE ORIGEN' }, { key: 'contacto', label: 'CONTACTO' }, { key: 'email', label: 'CORREO' }],
  },
  clients: {
    title: 'Clientes UE',
    description: 'Gestiona compradores y destinos de tus exportaciones en Europa.',
    api: 'clientes/',
    createLabel: 'Nuevo cliente',
    fields: [
      { key: 'razon_social', label: 'Razón social', kind: 'text', required: true },
      { key: 'tax_id_vat', label: 'Tax ID / VAT', kind: 'text', required: true, hint: 'Formato: 2 letras de país + 8 a 12 caracteres, ej. DE123456789.' },
      { key: 'pais_destino', label: 'País de destino', kind: 'text', required: true },
      { key: 'direccion', label: 'Dirección', kind: 'text', required: true },
      { key: 'puerto_destino', label: 'Puerto de destino', kind: 'text' },
      { key: 'email_contacto', label: 'Correo de contacto', kind: 'email' },
    ],
    columns: [{ key: 'razon_social', label: 'RAZÓN SOCIAL' }, { key: 'tax_id_vat', label: 'TAX ID / VAT' }, { key: 'pais_destino', label: 'PAÍS' }, { key: 'puerto_destino', label: 'PUERTO' }, { key: 'email_contacto', label: 'CORREO DE CONTACTO' }, { key: 'direccion', label: 'DIRECCIÓN' }],
  },
  lots: {
    title: 'Inventario y lotes',
    description: 'Controla disponibilidad, calidad y cosecha de cada lote.',
    api: 'lotes/',
    createLabel: 'Registrar lote',
    fields: [
      { key: 'tipo_producto', label: 'Producto', kind: 'select', required: true, options: ['Café', 'Cacao'] },
      { key: 'producto', label: 'Producto del catálogo', kind: 'select', source: 'productos', hint: 'Opcional. Seleccionar un producto completa el tipo automáticamente.' },
      { key: 'proveedor', label: 'Proveedor', kind: 'select', source: 'proveedores' },
      { key: 'peso_kg', label: 'Peso disponible (kg)', kind: 'number', required: true, min: 0.01, step: 0.01 },
      { key: 'calidad', label: 'Calidad', kind: 'text', required: true },
      { key: 'fecha_cosecha', label: 'Fecha de cosecha', kind: 'date', required: true },
      { key: 'estado', label: 'Estado', kind: 'select', required: true, options: ['Disponible', 'Reservado', 'Exportado'] },
    ],
    columns: [{ key: 'codigo_lote', label: 'CÓDIGO DE LOTE' }, { key: 'tipo_producto', label: 'TIPO' }, { key: 'producto', label: 'PRODUCTO' }, { key: 'proveedor', label: 'PROVEEDOR' }, { key: 'peso_kg', label: 'PESO (KG)' }, { key: 'calidad', label: 'CALIDAD' }, { key: 'fecha_cosecha', label: 'COSECHA' }, { key: 'estado', label: 'ESTADO' }],
  },
  certificates: {
    title: 'Certificados',
    description: 'Asocia certificaciones de calidad y cumplimiento a tus lotes.',
    api: 'certificaciones/',
    createLabel: 'Subir certificado',
    fields: [
      { key: 'lote', label: 'Lote', kind: 'select', source: 'lotes', required: true },
      { key: 'tipo_certificado', label: 'Tipo de certificado', kind: 'select', required: true, options: ['Fitosanitario', 'Orgánico', 'Fairtrade'] },
      { key: 'archivo_pdf', label: 'Archivo PDF', kind: 'file', required: true },
    ],
    columns: [{ key: 'id', label: 'CERTIFICADO' }, { key: 'lote', label: 'LOTE' }, { key: 'tipo_certificado', label: 'TIPO' }, { key: 'fecha_expedicion', label: 'EXPEDICIÓN' }, { key: 'archivo_pdf', label: 'ARCHIVO' }],
  },
};

@Component({
  selector: 'app-resource-page',
  standalone: true,
  imports: [DecimalPipe, NgFor, NgIf, NgSwitch, NgSwitchCase, NgSwitchDefault, FormsModule],
  template: `
    <section class="page">
      <div class="page-heading">
        <div><span class="eyebrow">GESTIÓN DE OPERACIONES</span><h1>{{ resource.title }}</h1><p>{{ resource.description }}</p></div>
        <button class="primary-button" *ngIf="canCreate" (click)="openCreate()">＋ {{ resource.createLabel }}</button>
      </div>
      <div class="toolbar"><div class="search-wrap"><span>⌕</span><input [(ngModel)]="search" placeholder="Buscar en {{ resource.title.toLowerCase() }}…" aria-label="Buscar" /></div><button class="refresh-button" (click)="load()">↻ Actualizar</button><span class="result-count">{{ filteredRows.length }} registros</span></div>
      <div class="alert error-alert" *ngIf="error">{{ error }}</div>
      <div class="panel table-panel">
        <div class="table-wrap"><table><thead><tr><th *ngFor="let column of resource.columns">{{ column.label }}</th><th *ngIf="canEdit || canDelete" class="actions-heading">ACCIONES</th></tr></thead>
          <tbody><tr *ngFor="let row of filteredRows">
            <td *ngFor="let column of resource.columns">
              <ng-container [ngSwitch]="column.key">
                <a *ngSwitchCase="'archivo_pdf'" class="file-link" [href]="displayValue(row, column.key)" target="_blank" rel="noopener">Ver archivo ↗</a>
                <span *ngSwitchCase="'estado'" class="state-chip">{{ displayValue(row, column.key) }}</span>
                <span *ngSwitchDefault>{{ displayValue(row, column.key) }}</span>
              </ng-container>
            </td>
            <td *ngIf="canEdit || canDelete" class="actions-cell"><button *ngIf="canEdit" class="table-action" (click)="openEdit(row)" [attr.aria-label]="'Editar ' + (row['id'] || '')">Editar</button><button *ngIf="canDelete" class="table-action danger" (click)="deleteRow(row)">Eliminar</button></td>
          </tr><tr *ngIf="!filteredRows.length"><td class="empty-state" [attr.colspan]="resource.columns.length + (canEdit || canDelete ? 1 : 0)">{{ loading ? 'Cargando registros…' : (search ? 'No hay coincidencias.' : 'No hay registros.') }}</td></tr></tbody>
        </table></div>
      </div>
      <div class="modal-backdrop" *ngIf="formOpen" (click)="closeOnBackdrop($event)">
        <section class="form-modal" role="dialog" aria-modal="true" [attr.aria-label]="editing ? 'Editar registro' : resource.createLabel">
          <div class="modal-title"><div><span class="eyebrow">{{ editing ? 'ACTUALIZAR REGISTRO' : 'NUEVO REGISTRO' }}</span><h2>{{ editing ? 'Editar' : resource.createLabel }}</h2></div><button class="close-button" (click)="closeForm()" aria-label="Cerrar">×</button></div>
          <form (ngSubmit)="save()" #recordForm="ngForm">
            <label *ngFor="let field of resource.fields">{{ field.label }}
              <ng-container [ngSwitch]="field.kind">
                <select *ngSwitchCase="'select'" [name]="field.key" [(ngModel)]="form[field.key]" [required]="!!field.required" (ngModelChange)="onFieldChange(field)">
                  <option [ngValue]="''">Selecciona una opción</option><option *ngFor="let option of selectOptions(field)" [ngValue]="option.value">{{ option.label }}</option>
                </select>
                <textarea *ngSwitchCase="'textarea'" [name]="field.key" [(ngModel)]="form[field.key]" rows="3"></textarea>
                <input *ngSwitchCase="'file'" type="file" [name]="field.key" accept=".pdf,application/pdf" [required]="!!field.required && !editing" (change)="chooseFile($event, field.key)" />
                <span *ngSwitchCase="'checkbox'" class="checkbox-field"><input type="checkbox" [name]="field.key" [(ngModel)]="form[field.key]" /><span>{{ form[field.key] ? 'Activado' : 'Desactivado' }}</span></span>
                <input *ngSwitchDefault [type]="field.kind" [name]="field.key" [(ngModel)]="form[field.key]" [required]="!!field.required && !(editing && field.key === 'password')" [min]="field.min ?? null" [step]="field.step ?? null" [minlength]="field.key === 'password' ? 8 : null" [placeholder]="field.key === 'password' && editing ? 'Dejar en blanco para mantener la actual' : ''" (ngModelChange)="onFieldChange(field)" />
              </ng-container>
              <small *ngIf="field.kind === 'file' && selectedFile" class="field-hint">{{ selectedFile.name }} · {{ (selectedFile.size / 1048576) | number:'1.2-2' }} MB</small>
              <small *ngIf="field.hint" class="field-hint">{{ field.hint }}</small>
            </label>
            <div class="alert error-alert" *ngIf="formError">{{ formError }}</div>
            <div class="modal-actions"><button type="button" class="secondary-button" (click)="closeForm()">Cancelar</button><button class="primary-button" [disabled]="recordForm.invalid || saving || !!formError">{{ saving ? 'Guardando…' : (editing ? 'Guardar cambios' : 'Crear registro') }}</button></div>
          </form>
        </section>
      </div>
    </section>
  `,
  styles: [`
    .page{max-width:1440px;margin:0 auto;padding:36px 38px 52px;color:#243b30}.page-heading{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:26px}.eyebrow{font-size:10px;font-weight:700;letter-spacing:1.55px;color:#739551}.page-heading h1{font-size:29px;letter-spacing:-1px;margin:8px 0 6px;color:#19392d}.page-heading p{margin:0;color:#849087;font-size:12px}.primary-button{background:#1b4935;color:#fff;border:0;border-radius:7px;padding:11px 15px;font-size:12px;font-weight:600;cursor:pointer}.primary-button:hover:not(:disabled){background:#286347}.primary-button:disabled{opacity:.55;cursor:not-allowed}.toolbar{display:flex;align-items:center;gap:12px;margin-bottom:14px}.search-wrap{width:min(360px,60%);position:relative}.search-wrap span{position:absolute;left:12px;top:7px;color:#819087;font-size:18px}.search-wrap input{width:100%;height:36px;border:1px solid #e1e8e1;border-radius:7px;padding:0 12px 0 35px;outline:none;font-size:11px}.search-wrap input:focus{border-color:#86a76d}.refresh-button,.secondary-button{background:#fff;border:1px solid #dfe7df;border-radius:6px;color:#576b5e;padding:9px 12px;font-size:11px;cursor:pointer}.result-count{margin-left:auto;color:#8a968e;font-size:10px}.panel{background:#fff;border:1px solid #e6ece6;border-radius:9px;overflow:hidden}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;white-space:nowrap}th{background:#f8faf8;color:#8d9990;font-size:9px;letter-spacing:.7px;text-align:left;padding:13px 15px;font-weight:700}td{padding:14px 15px;border-bottom:1px solid #eff2ef;color:#53645a;font-size:11px}tr:last-child td{border-bottom:0}.actions-heading{text-align:right}.actions-cell{text-align:right}.table-action{border:0;background:transparent;color:#4c7544;font-size:10px;font-weight:600;cursor:pointer;margin-left:9px}.table-action.danger{color:#aa6158}.empty-state{text-align:center;padding:35px;color:#929e95}.state-chip{background:#edf5e9;color:#577846;border-radius:20px;padding:5px 9px;font-size:9px}.file-link{color:#4d7947;text-decoration:none}.alert{background:#fff0ee;color:#aa4035;padding:11px;border-radius:6px;font-size:12px;margin:0 0 13px}.modal-backdrop{position:fixed;inset:0;background:rgba(16,35,27,.42);z-index:10;display:grid;place-items:center;padding:20px}.form-modal{width:min(100%,520px);max-height:90vh;overflow:auto;background:white;border-radius:12px;padding:24px;box-shadow:0 20px 70px #102d2533}.modal-title{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px}.modal-title h2{color:#1e3d2e;font-size:21px;margin:7px 0 0}.close-button{background:#f2f5f2;border:0;border-radius:50%;width:30px;height:30px;color:#53645a;font-size:20px;cursor:pointer}.form-modal label{display:block;color:#354b3e;font-weight:600;font-size:11px;margin:0 0 15px}.form-modal input,.form-modal select,.form-modal textarea{display:block;width:100%;margin-top:7px;padding:10px 11px;background:#fff;border:1px solid #dfe6df;border-radius:6px;color:#30463a;font:inherit;font-weight:400;outline:none}.form-modal input:focus,.form-modal select:focus,.form-modal textarea:focus{border-color:#7d9d64;box-shadow:0 0 0 3px #f0f5e9}.field-hint{display:block;color:#929d94;font-weight:400;margin-top:6px;font-size:10px}.modal-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:22px}.modal-actions .primary-button{min-width:130px}
        .checkbox-field{display:flex;align-items:center;gap:8px;margin-top:8px;color:#6b7b70;font-size:10px;font-weight:400}.form-modal .checkbox-field input{width:15px;height:15px;margin:0;accent-color:#537a42}
    @media(max-width:850px){.page{padding:28px 22px}.page-heading h1{font-size:25px}.table-panel{margin:0 -4px}}@media(max-width:580px){.page{padding:22px 13px}.page-heading{align-items:flex-start;gap:15px;flex-direction:column}.toolbar{flex-wrap:wrap}.search-wrap{width:100%}.result-count{margin-left:auto}.form-modal{padding:18px}}
  `],
})
/** Construye formularios y tablas según la configuración del recurso en la ruta. */
export class ResourcePageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);
  resource!: ResourceDefinition;
  rows: Record<string, unknown>[] = [];
  form: Record<string, string | number | boolean> = {};
  search = '';
  error = '';
  formError = '';
  loading = false;
  saving = false;
  formOpen = false;
  selectedFile: File | null = null;
  editing: Record<string, unknown> | null = null;
  suppliers: Supplier[] = [];
  products: Product[] = [];
  lots: Lot[] = [];
  permissions: RolePermission[] = [];

  get canCreate(): boolean {
    return this.hasPermission('puede_crear');
  }

  get canEdit(): boolean {
    return this.hasPermission('puede_editar');
  }

  get canDelete(): boolean {
    return this.hasPermission('puede_eliminar');
  }

  private get currentUserRole(): string {
    return this.auth.user()?.rol ?? '';
  }

  private hasPermission(action: keyof Pick<RolePermission, 'puede_crear' | 'puede_editar' | 'puede_eliminar'>): boolean {
    if (this.currentUserRole === 'Admin') return true;
    const resource = this.resource.api.replace(/\/$/, '');
    return this.permissions.find((permission) => permission.recurso === resource)?.[action] ?? false;
  }

  get filteredRows(): Record<string, unknown>[] {
    const query = this.search.trim().toLowerCase();
    return query
      ? this.rows.filter((row) => this.resource.columns.some(({ key }) => String(row[key] ?? '').toLowerCase().includes(query)))
      : this.rows;
  }

  ngOnInit(): void {
    this.route.data.subscribe((data) => {
      this.resource = RESOURCES[data['resource'] as string] ?? RESOURCES['lots'];
      this.load();
    });
  }

  load(): void {
    this.loading = true;
    this.error = '';
    const sources = new Set(this.resource.fields.map((field) => field.source).filter(Boolean));
    forkJoin({
      rows: this.api.list<Record<string, unknown>>(this.resource.api),
      permissions: this.api.list<RolePermission>('permisos/mi-rol/'),
      suppliers: sources.has('proveedores') ? this.api.list<Supplier>('proveedores/').pipe(catchError(() => of([]))) : of([]),
      products: sources.has('productos') ? this.api.list<Product>('productos/').pipe(catchError(() => of([]))) : of([]),
      lots: sources.has('lotes') ? this.api.list<Lot>('lotes/').pipe(catchError(() => of([]))) : of([]),
    }).subscribe({
      next: (data) => {
        this.rows = data.rows;
        this.permissions = data.permissions;
        this.suppliers = data.suppliers;
        this.products = data.products;
        this.lots = data.lots;
        this.loading = false;
      },
      error: (error: HttpErrorResponse) => {
        this.rows = [];
        this.permissions = [];
        this.loading = false;
        this.error = error.status === 0
          ? 'No se pudo conectar con la API. Comprueba que Django esté ejecutándose.'
          : `No se pudieron cargar los registros (${error.status}).`;
      },
    });
  }

  displayValue(row: Record<string, unknown>, key: string): string {
    const value = row[key];
    if (value === null || value === undefined || value === '') return '—';
    if (key === 'proveedor') return this.suppliers.find((item) => item.id === Number(value))?.razon_social ?? String(value);
    if (key === 'producto') return this.products.find((item) => item.id === Number(value))?.nombre ?? String(value);
    if (key === 'lote') return this.lots.find((item) => item.id === Number(value))?.codigo_lote ?? String(value);
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    if (key === 'fecha_cosecha' || key === 'fecha_expedicion') {
      const date = new Date(String(value));
      return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('es-CO').format(date);
    }
    return String(value);
  }

  openCreate(): void {
    this.editing = null;
    this.form = {};
    this.resource.fields.filter((field) => field.kind === 'checkbox').forEach((field) => {
      this.form[field.key] = field.key === 'is_active';
    });
    this.selectedFile = null;
    this.formError = '';
    this.formOpen = true;
  }

  openEdit(row: Record<string, unknown>): void {
    this.editing = row;
    this.form = {};
    this.resource.fields.forEach((field) => {
      const value = row[field.key];
      this.form[field.key] = value === null || value === undefined
        ? ''
        : field.json
          ? JSON.stringify(value, null, 2)
          : (value as string | number | boolean);
    });
    this.selectedFile = null;
    this.formError = '';
    this.formOpen = true;
  }

  chooseFile(event: Event, key: string): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.formError = '';
    const validationError = file ? validateCertificateFile(file) : null;
    if (validationError) {
      this.selectedFile = null;
      input.value = '';
      this.formError = validationError;
      return;
    }
    this.selectedFile = file;
    this.form[key] = this.selectedFile?.name ?? '';
  }

  save(): void {
    this.formError = '';
    if (this.resource.api === 'certificaciones/' && !this.editing && !this.selectedFile) {
      this.formError = 'Selecciona un certificado PDF (máximo 5 MB).';
      return;
    }
    const payload: Record<string, unknown> = {};
    try {
      this.resource.fields.forEach((field) => {
        if (field.kind === 'file') return;
        const value = this.form[field.key];
        if (field.key === 'password' && value === '') return;
        if (field.json && typeof value === 'string') {
          payload[field.key] = value.trim() ? JSON.parse(value) as unknown : {};
        } else if (value !== '' && value !== undefined) {
          payload[field.key] = field.kind === 'number' || field.source ? Number(value) : value;
        } else if (field.source) {
          payload[field.key] = null;
        } else if (field.kind === 'number') {
          return;
        } else {
          payload[field.key] = value;
        }
      });
    } catch {
      this.formError = 'El campo de permisos personalizados debe contener JSON válido.';
      return;
    }
    this.saving = true;

    let request;
    if (this.resource.api === 'certificaciones/') {
      const multipart = new FormData();
      Object.entries(payload).forEach(([key, value]) => multipart.append(key, String(value)));
      if (this.selectedFile) multipart.append('archivo_pdf', this.selectedFile);
      request = this.editing
        ? this.api.update(this.resource.api, this.editing['id'] as number, multipart)
        : this.api.create(this.resource.api, multipart);
    } else {
      request = this.editing
        ? this.api.update(this.resource.api, this.editing['id'] as number, payload)
        : this.api.create(this.resource.api, payload);
    }
    request.subscribe({
      next: () => { this.saving = false; this.closeForm(); this.load(); },
      error: (error: HttpErrorResponse) => {
        this.saving = false;
        const detail = error.error?.detail;
        this.formError = typeof detail === 'string' ? detail : `No se pudo guardar el registro (${error.status || 'sin conexión'}). Revisa los datos e inténtalo de nuevo.`;
      },
    });
  }

  deleteRow(row: Record<string, unknown>): void {
    const label = String(row['codigo_lote'] ?? row['razon_social'] ?? row['nombre'] ?? row['id']);
    if (!window.confirm(`¿Eliminar "${label}"? Esta acción no se puede deshacer.`)) return;
    this.api.remove(this.resource.api, row['id'] as number).subscribe({
      next: () => this.load(),
      error: (error: HttpErrorResponse) => this.error = `No se pudo eliminar el registro (${error.status || 'sin conexión'}).`,
    });
  }

  closeForm(): void {
    this.formOpen = false;
    this.saving = false;
  }

  closeOnBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closeForm();
  }

  selectOptions(field: ResourceField): SelectOption[] {
    if (field.source === 'proveedores') {
      return this.suppliers.map((supplier) => ({
        value: supplier.id,
        label: `${supplier.razon_social} · ${supplier.nit}`,
      }));
    }
    if (field.source === 'productos') {
      return this.products.map((product) => ({
        value: product.id,
        label: `${product.nombre} · ${product.tipo_producto}`,
      }));
    }
    if (field.source === 'lotes') {
      return this.lots.map((lot) => ({
        value: lot.id,
        label: `${lot.codigo_lote} · ${lot.tipo_producto} · ${lot.peso_kg} kg`,
      }));
    }
    return (field.options ?? []).map((option) => ({ value: option, label: option }));
  }

  onFieldChange(field: ResourceField): void {
    if (field.key !== 'producto' || !this.form['producto']) return;
    const selected = this.products.find((product) => product.id === Number(this.form['producto']));
    if (selected) this.form['tipo_producto'] = selected.tipo_producto;
  }
}
