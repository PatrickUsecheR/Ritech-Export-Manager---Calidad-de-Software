/** Matriz de permisos por rol con guardado automático y valores predeterminados. */

import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { ApiService } from '../core/api.service';
import { RolePermission, UserRole } from '../core/models';

interface PermissionResource {
  key: string;
  label: string;
  description: string;
}

type PermissionAction = 'puede_leer' | 'puede_crear' | 'puede_editar' | 'puede_eliminar';
type Grant = Partial<Record<UserRole, PermissionAction[]>>;

const DEFAULT_GRANTS: Record<string, Grant> = {
  usuarios: {},
  permisos: {},
  proveedores: {
    Analista: ['puede_leer', 'puede_crear', 'puede_editar', 'puede_eliminar'],
    Calidad: ['puede_leer'],
    Cliente: ['puede_leer'],
  },
  productos: {
    Analista: ['puede_leer', 'puede_crear', 'puede_editar', 'puede_eliminar'],
    Calidad: ['puede_leer'],
    Cliente: ['puede_leer'],
  },
  clientes: {
    Analista: ['puede_leer', 'puede_crear', 'puede_editar', 'puede_eliminar'],
    Calidad: ['puede_leer'],
    Cliente: ['puede_leer'],
  },
  lotes: {
    Analista: ['puede_leer', 'puede_crear', 'puede_editar', 'puede_eliminar'],
    Calidad: ['puede_leer'],
    Cliente: ['puede_leer'],
  },
  certificaciones: {
    Analista: ['puede_leer'],
    Calidad: ['puede_leer', 'puede_crear', 'puede_editar', 'puede_eliminar'],
    Cliente: ['puede_leer'],
  },
  ordenes: {
    Analista: ['puede_leer', 'puede_crear', 'puede_editar', 'puede_eliminar'],
    Calidad: ['puede_leer'],
    Cliente: ['puede_leer'],
  },
  dashboard: {
    Analista: ['puede_leer'],
    Calidad: ['puede_leer'],
    Cliente: ['puede_leer'],
  },
  trazabilidad: {
    Admin: ['puede_leer', 'puede_crear', 'puede_editar', 'puede_eliminar'],
    Analista: ['puede_leer'],
    Calidad: ['puede_leer', 'puede_crear'],
    Cliente: ['puede_leer'],
  },
};

@Component({
  selector: 'app-permissions',
  standalone: true,
  imports: [NgFor, NgIf],
  template: `
    <section class="page">
      <header class="page-heading">
        <div><span class="eyebrow">ADMINISTRACIÓN</span><h1>Matriz de permisos</h1><p>Controla las acciones que puede realizar cada rol en cada recurso.</p></div>
        <button class="refresh-button" (click)="load()" [disabled]="loading">↻ Actualizar</button>
      </header>
      <div class="role-tabs" role="tablist" aria-label="Roles">
        <button *ngFor="let role of roles" role="tab" [attr.aria-selected]="selectedRole === role" [class.active]="selectedRole === role" (click)="selectRole(role)">{{ role }}</button>
      </div>
      <div class="admin-note" *ngIf="selectedRole === 'Admin'"><span>✦</span> El rol Admin conserva acceso total a todos los recursos. La matriz no restringe las acciones de administradores.</div>
      <div class="alert error-alert" *ngIf="error">{{ error }}</div>
      <div class="alert success-alert" *ngIf="notice">{{ notice }}</div>
      <section class="permissions-panel">
        <div class="matrix-toolbar"><div><strong>Acceso por recurso</strong><small>{{ selectedRole }} · {{ resources.length }} recursos</small></div><span *ngIf="savingCount" class="saving-status">Guardando cambios…</span></div>
        <div class="matrix-scroll">
          <table>
            <thead><tr><th>RECURSO</th><th>LEER</th><th>CREAR</th><th>EDITAR</th><th>ELIMINAR</th><th>CONFIGURACIÓN</th></tr></thead>
            <tbody>
              <tr *ngFor="let resource of resources">
                <td class="resource-cell"><strong>{{ resource.label }}</strong><small>{{ resource.description }}</small></td>
                <td *ngFor="let action of actions" class="check-cell">
                  <label class="permission-control">
                    <input type="checkbox" [checked]="permission(resource.key)[action]" [disabled]="selectedRole === 'Admin' || isSaving(resource.key) || loading" (change)="setPermission(resource.key, action, $any($event.target).checked)" [attr.aria-label]="actionLabel(action) + ' — ' + resource.label" />
                    <span></span>
                  </label>
                </td>
                <td class="reset-cell"><button (click)="reset(resource.key)" [disabled]="selectedRole === 'Admin' || isSaving(resource.key) || !permission(resource.key).id" title="Eliminar permisos personalizados y restaurar el rol predeterminado">Restablecer</button></td>
              </tr>
              <tr *ngIf="!loading && !resources.length"><td colspan="6" class="empty-state">No hay recursos configurados.</td></tr>
              <tr *ngIf="loading"><td colspan="6" class="empty-state">Cargando permisos…</td></tr>
            </tbody>
          </table>
        </div>
        <footer class="matrix-footer"><span>Los cambios se aplican inmediatamente en la API.</span><span>{{ selectedRole === 'Admin' ? 'Acceso total' : 'Guardado automático' }}</span></footer>
      </section>
    </section>
  `,
  styles: [`
    .page{max-width:1440px;margin:0 auto;padding:36px 38px 52px;color:#243b30}.page-heading{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:25px}.eyebrow{font-size:10px;font-weight:700;letter-spacing:1.55px;color:#739551}.page-heading h1{font-size:29px;letter-spacing:-1px;margin:8px 0 6px;color:#19392d}.page-heading p{margin:0;color:#849087;font-size:12px}.refresh-button{background:#fff;border:1px solid #dfe7df;border-radius:6px;color:#576b5e;padding:9px 12px;font-size:11px;cursor:pointer}.refresh-button:disabled{opacity:.55}.role-tabs{display:flex;gap:8px;border-bottom:1px solid #e3ebe3;margin-bottom:15px}.role-tabs button{border:0;background:transparent;color:#7e8d82;padding:11px 15px 12px;font-size:11px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px}.role-tabs button.active{color:#315c3a;border-color:#79a15a}.admin-note{padding:12px 14px;border:1px solid #e3ecd9;background:#f4f8ef;color:#62754e;border-radius:7px;font-size:11px;margin-bottom:14px}.admin-note span{margin-right:7px;color:#83a15c}.permissions-panel{background:#fff;border:1px solid #e6ece6;border-radius:10px;overflow:hidden}.matrix-toolbar{padding:17px 19px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #edf1ed}.matrix-toolbar strong,.matrix-toolbar small{display:block}.matrix-toolbar strong{font-size:13px;color:#304638}.matrix-toolbar small{font-size:10px;color:#929d94;margin-top:4px}.saving-status{font-size:10px;color:#72934f}.matrix-scroll{overflow:auto}table{width:100%;border-collapse:collapse;min-width:730px}thead th{text-align:center;background:#f8faf8;color:#89968d;font-size:8px;letter-spacing:.8px;padding:13px 10px}thead th:first-child{text-align:left;padding-left:19px;width:33%}thead th:last-child{width:120px}tbody td{border-bottom:1px solid #eff2ef;padding:13px 10px;text-align:center}.resource-cell{text-align:left;padding-left:19px}.resource-cell strong,.resource-cell small{display:block}.resource-cell strong{color:#3a5142;font-size:11px}.resource-cell small{color:#929d94;font-size:9px;margin-top:4px}.check-cell{width:84px}.permission-control{width:22px;height:22px;display:inline-grid;place-items:center;position:relative;cursor:pointer}.permission-control input{position:absolute;inset:0;opacity:0;cursor:pointer}.permission-control span{width:16px;height:16px;border:1px solid #cbd6ca;border-radius:4px;background:#fff;transition:.15s}.permission-control input:checked+span{background:#5f8749;border-color:#5f8749}.permission-control input:checked+span:after{content:"";position:absolute;left:8px;top:4px;width:4px;height:8px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg)}.permission-control input:focus-visible+span{outline:3px solid #bdd593;outline-offset:2px}.permission-control input:disabled+span{background:#f0f3ef;border-color:#e0e6df;cursor:not-allowed}.reset-cell button{border:0;background:none;color:#718d5b;font-size:9px;cursor:pointer}.reset-cell button:disabled{opacity:.35;cursor:not-allowed}.matrix-footer{display:flex;justify-content:space-between;padding:12px 19px;color:#929d94;font-size:9px;background:#fbfcfb}.empty-state{text-align:center;padding:35px;color:#929e95}.alert{padding:11px;border-radius:6px;font-size:12px;margin:0 0 13px}.error-alert{background:#fff0ee;color:#aa4035}.success-alert{background:#eff7eb;color:#547a42}
    @media(max-width:850px){.page{padding:28px 22px}.page-heading h1{font-size:25px}}@media(max-width:560px){.page{padding:22px 13px}.page-heading{align-items:flex-start;gap:15px;flex-direction:column}.role-tabs{overflow:auto}.role-tabs button{padding-left:11px;padding-right:11px;white-space:nowrap}.matrix-footer{gap:12px;flex-direction:column}}
  `],
})
/** Consulta y actualiza los permisos por rol que aplica el backend. */
export class PermissionsComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly roles: UserRole[] = ['Admin', 'Analista', 'Calidad', 'Cliente'];
  readonly actions: PermissionAction[] = [
    'puede_leer',
    'puede_crear',
    'puede_editar',
    'puede_eliminar',
  ];
  readonly resources: PermissionResource[] = [
    { key: 'usuarios', label: 'Usuarios', description: 'Cuentas, roles y accesos de usuario' },
    { key: 'permisos', label: 'Permisos', description: 'Matriz de permisos por rol' },
    { key: 'proveedores', label: 'Proveedores', description: 'Productores y entidades de origen' },
    { key: 'productos', label: 'Productos', description: 'Catálogo exportable y precios' },
    { key: 'clientes', label: 'Clientes UE', description: 'Compradores y destinos europeos' },
    { key: 'lotes', label: 'Inventario y lotes', description: 'Stock, cosecha y disponibilidad' },
    { key: 'certificaciones', label: 'Certificaciones', description: 'Documentos de calidad y cumplimiento' },
    { key: 'ordenes', label: 'Órdenes', description: 'Exportaciones, precios y estados' },
    { key: 'dashboard', label: 'Dashboard', description: 'Resumen operativo' },
    { key: 'trazabilidad', label: 'Trazabilidad', description: 'Consulta pública y eventos de envío' },
  ];
  selectedRole: UserRole = 'Analista';
  permissions: RolePermission[] = [];
  loading = false;
  savingCount = 0;
  error = '';
  notice = '';
  private readonly savingResources = new Set<string>();

  ngOnInit(): void {
    this.load();
  }

  selectRole(role: UserRole): void {
    this.selectedRole = role;
    this.notice = '';
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.api.list<RolePermission>('permisos/').subscribe({
      next: (permissions) => {
        this.permissions = permissions;
        this.loading = false;
      },
      error: (error: HttpErrorResponse) => {
        this.loading = false;
        this.error = error.status === 403
          ? 'Solo un administrador puede consultar la matriz de permisos.'
          : `No se pudieron cargar los permisos (${error.status || 'sin conexión'}).`;
      },
    });
  }

  permission(resource: string): RolePermission {
    if (this.selectedRole === 'Admin') {
      return {
        id: 0,
        rol: 'Admin',
        recurso: resource,
        puede_leer: true,
        puede_crear: true,
        puede_editar: true,
        puede_eliminar: true,
      };
    }
    const stored = this.permissions.find(
      (item) => item.rol === this.selectedRole && item.recurso === resource,
    );
    if (stored) return stored;
    const grants = DEFAULT_GRANTS[resource]?.[this.selectedRole] ?? [];
    return {
      id: 0,
      rol: this.selectedRole,
      recurso: resource,
      puede_leer: grants.includes('puede_leer'),
      puede_crear: grants.includes('puede_crear'),
      puede_editar: grants.includes('puede_editar'),
      puede_eliminar: grants.includes('puede_eliminar'),
    };
  }

  isSaving(resource: string): boolean {
    return this.savingResources.has(resource);
  }

  actionLabel(action: PermissionAction): string {
    return action.replace('puede_', '').replace(/^./, (letter) => letter.toUpperCase());
  }

  setPermission(resource: string, action: PermissionAction, allowed: boolean): void {
    const before = this.permission(resource);
    const next = { ...before, [action]: allowed };
    this.notice = '';
    this.error = '';
    this.savingResources.add(resource);
    this.savingCount = this.savingResources.size;
    const payload = {
      rol: next.rol,
      recurso: next.recurso,
      puede_leer: next.puede_leer,
      puede_crear: next.puede_crear,
      puede_editar: next.puede_editar,
      puede_eliminar: next.puede_eliminar,
    };
    const request = before.id
      ? this.api.update<RolePermission>('permisos/', before.id, payload)
      : this.api.create<RolePermission>('permisos/', payload);
    request.subscribe({
      next: (saved) => {
        this.permissions = this.permissions.filter(
          (item) => !(item.rol === saved.rol && item.recurso === saved.recurso),
        );
        this.permissions = [...this.permissions, saved];
        this.finishSaving(resource);
        this.notice = `Permisos de ${this.resourceLabel(resource)} guardados.`;
      },
      error: (error: HttpErrorResponse) => {
        this.finishSaving(resource);
        this.error = error.status === 403
          ? 'No tienes autorización para modificar esta matriz.'
          : `No se pudo guardar el permiso (${error.status || 'sin conexión'}).`;
        this.load();
      },
    });
  }

  reset(resource: string): void {
    const permission = this.permission(resource);
    if (!permission.id) return;
    this.error = '';
    this.notice = '';
    this.savingResources.add(resource);
    this.savingCount = this.savingResources.size;
    this.api.remove('permisos/', permission.id).subscribe({
      next: () => {
        this.permissions = this.permissions.filter((item) => item.id !== permission.id);
        this.finishSaving(resource);
        this.notice = `Permisos de ${this.resourceLabel(resource)} restaurados a los valores predeterminados del rol.`;
      },
      error: (error: HttpErrorResponse) => {
        this.finishSaving(resource);
        this.error = `No se pudo restablecer el permiso (${error.status || 'sin conexión'}).`;
      },
    });
  }

  private finishSaving(resource: string): void {
    this.savingResources.delete(resource);
    this.savingCount = this.savingResources.size;
  }

  private resourceLabel(key: string): string {
    return this.resources.find((resource) => resource.key === key)?.label ?? key;
  }
}
