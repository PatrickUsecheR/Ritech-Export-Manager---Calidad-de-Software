/** Contenedor principal: navegación por rol, controles de sesión y vistas enrutadas. */

import { Component, inject } from '@angular/core';
import { DatePipe, NgFor, NgIf } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';

interface NavigationItem {
  label: string;
  path: string;
  icon: string;
  roles: string[];
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [DatePipe, NgFor, NgIf, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly auth = inject(AuthService);
  readonly today = new Date();
  private readonly router = inject(Router);
  readonly navigation: NavigationItem[] = [
    { label: 'Dashboard', path: '/dashboard', icon: '⌂', roles: ['Admin', 'Analista', 'Calidad', 'Cliente'] },
    { label: 'Usuarios', path: '/users', icon: '♙', roles: ['Admin'] },
    { label: 'Matriz de permisos', path: '/permissions', icon: '☷', roles: ['Admin'] },
    { label: 'Productos', path: '/products', icon: '◈', roles: ['Admin', 'Analista', 'Calidad', 'Cliente'] },
    { label: 'Proveedores', path: '/suppliers', icon: '⌁', roles: ['Admin', 'Analista', 'Calidad', 'Cliente'] },
    { label: 'Clientes UE', path: '/clients', icon: '◎', roles: ['Admin', 'Analista', 'Calidad', 'Cliente'] },
    { label: 'Inventario y lotes', path: '/inventory', icon: '▦', roles: ['Admin', 'Analista', 'Calidad', 'Cliente'] },
    { label: 'Órdenes de exportación', path: '/orders', icon: '⇧', roles: ['Admin', 'Analista', 'Cliente'] },
    { label: 'Certificados', path: '/certificates', icon: '▤', roles: ['Admin', 'Analista', 'Calidad', 'Cliente'] },
    { label: 'Trazabilidad', path: '/traceability', icon: '⌕', roles: ['Admin', 'Analista', 'Calidad', 'Cliente'] },
    { label: 'Actualizar trazabilidad', path: '/admin/traceability', icon: '↻', roles: ['Admin', 'Calidad'] },
  ];

  visibleNavigation(): NavigationItem[] {
    const role = this.auth.user()?.rol;
    return this.navigation.filter((item) => !role || item.roles.includes(role));
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
