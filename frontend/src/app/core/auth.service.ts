/** Gestiona el acceso, el almacenamiento JWT, el registro y la renovación de tokens. */

import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { map, tap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthResponse, User } from './models';

const ACCESS_TOKEN = 'ritech_access';
const REFRESH_TOKEN = 'ritech_refresh';
const CURRENT_USER = 'ritech_user';

@Injectable({ providedIn: 'root' })
/** Expone el usuario actual como señal y administra la sesión persistida. */
export class AuthService {
  private readonly http = inject(HttpClient);
  readonly user = signal<User | null>(this.restoreUser());
  readonly authenticated = computed(() => this.user() !== null);
  private readonly authUrl = `${environment.apiBaseUrl.replace(/\/$/, '')}/auth`;

  login(email: string, password: string) {
    return this.http
      .post<AuthResponse>(`${this.authUrl}/login/`, { email, password })
      .pipe(tap((response) => this.saveSession(response)));
  }

  register(nombre: string, email: string, password: string) {
    return this.http.post<User>(`${this.authUrl}/register/`, { nombre, email, password });
  }

  logout(): void {
    localStorage.removeItem(ACCESS_TOKEN);
    localStorage.removeItem(REFRESH_TOKEN);
    localStorage.removeItem(CURRENT_USER);
    this.user.set(null);
  }

  accessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN);
  }

  refreshToken() {
    const refresh = localStorage.getItem(REFRESH_TOKEN);
    if (!refresh) {
      return throwError(() => new Error('No hay un token de renovación disponible.'));
    }

    return this.http
      .post<{ access: string }>(`${this.authUrl}/refresh/`, { refresh })
      .pipe(
        tap((response) => localStorage.setItem(ACCESS_TOKEN, response.access)),
        map((response) => response.access),
      );
  }

  private saveSession(response: AuthResponse): void {
    localStorage.setItem(ACCESS_TOKEN, response.access);
    localStorage.setItem(REFRESH_TOKEN, response.refresh);
    localStorage.setItem(CURRENT_USER, JSON.stringify(response.usuario));
    this.user.set(response.usuario);
  }

  private restoreUser(): User | null {
    try {
      const saved = localStorage.getItem(CURRENT_USER);
      return saved ? (JSON.parse(saved) as User) : null;
    } catch {
      localStorage.removeItem(CURRENT_USER);
      return null;
    }
  }
}
