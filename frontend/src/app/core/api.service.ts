/** Cliente HTTP tipado para recursos de la API y listas paginadas de DRF. */

import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiList } from './models';

@Injectable({ providedIn: 'root' })
/** Centraliza la construcción de URL y las solicitudes CRUD comunes a la API Django. */
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  list<T>(path: string, params?: Record<string, string>): Observable<T[]> {
    let query = new HttpParams();
    Object.entries(params ?? {}).forEach(([key, value]) => (query = query.set(key, value)));
    return this.http.get<T[] | ApiList<T>>(this.url(path), { params: query }).pipe(
      map((response) =>
        Array.isArray(response) ? response : (response.results ?? []),
      ),
    );
  }

  get<T>(path: string): Observable<T> {
    return this.http.get<T>(this.url(path));
  }

  create<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<T>(this.url(path), body);
  }

  update<T>(path: string, id: number | string, body: unknown): Observable<T> {
    return this.http.patch<T>(this.url(`${path}${id}/`), body);
  }

  remove(path: string, id: number | string): Observable<void> {
    return this.http.delete<void>(this.url(`${path}${id}/`));
  }

  private url(path: string): string {
    return `${this.baseUrl}/${path.replace(/^\/+/, '')}`;
  }
}
