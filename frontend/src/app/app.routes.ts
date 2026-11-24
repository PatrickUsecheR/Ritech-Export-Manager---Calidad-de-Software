/** Asocia las URL con páginas independientes y guardas de autenticación y rol. */

import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/auth.guard';
import { AuthPageComponent } from './pages/auth-page.component';
import { DashboardComponent } from './pages/dashboard.component';
import { OrdersComponent } from './pages/orders.component';
import { PermissionsComponent } from './pages/permissions.component';
import { ResourcePageComponent } from './pages/resource-page.component';
import { TraceabilityComponent } from './pages/traceability.component';

const authenticatedRoles = ['Admin', 'Analista', 'Calidad', 'Cliente'];
const readRoles = authenticatedRoles;

export const routes: Routes = [
  { path: 'login', component: AuthPageComponent, canActivate: [guestGuard], data: { mode: 'login' } },
  { path: 'register', component: AuthPageComponent, canActivate: [guestGuard], data: { mode: 'register' } },
  { path: 'traceability', component: TraceabilityComponent },
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard, roleGuard], data: { roles: authenticatedRoles } },
  { path: 'users', component: ResourcePageComponent, canActivate: [authGuard, roleGuard], data: { roles: ['Admin'], resource: 'users' } },
  { path: 'permissions', component: PermissionsComponent, canActivate: [authGuard, roleGuard], data: { roles: ['Admin'] } },
  { path: 'products', component: ResourcePageComponent, canActivate: [authGuard, roleGuard], data: { roles: readRoles, resource: 'products' } },
  { path: 'suppliers', component: ResourcePageComponent, canActivate: [authGuard, roleGuard], data: { roles: readRoles, resource: 'suppliers' } },
  { path: 'clients', component: ResourcePageComponent, canActivate: [authGuard, roleGuard], data: { roles: readRoles, resource: 'clients' } },
  { path: 'inventory', component: ResourcePageComponent, canActivate: [authGuard, roleGuard], data: { roles: readRoles, resource: 'lots' } },
  { path: 'orders', component: OrdersComponent, canActivate: [authGuard, roleGuard], data: { roles: readRoles } },
  { path: 'certificates', component: ResourcePageComponent, canActivate: [authGuard, roleGuard], data: { roles: readRoles, resource: 'certificates' } },
  { path: 'admin/traceability', component: TraceabilityComponent, canActivate: [authGuard, roleGuard], data: { roles: ['Admin', 'Calidad'], admin: true } },
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: '**', redirectTo: 'dashboard' },
];
