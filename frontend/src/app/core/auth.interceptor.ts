/** Añade JWT a las solicitudes y coordina una renovación compartida tras HTTP 401. */

import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, finalize, Observable, shareReplay, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

let refreshInFlight$: Observable<string> | null = null;

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const isRefreshRequest = request.url.endsWith('/auth/refresh/');
  const token = isRefreshRequest ? null : auth.accessToken();
  const authorizedRequest = token
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(authorizedRequest).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401 || !token || isRefreshRequest) {
        return throwError(() => error);
      }

      refreshInFlight$ ??= auth.refreshToken().pipe(
        finalize(() => {
          refreshInFlight$ = null;
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );

      return refreshInFlight$.pipe(
        switchMap((accessToken) =>
          next(request.clone({
            setHeaders: { Authorization: `Bearer ${accessToken}` },
          })),
        ),
        catchError((refreshError: unknown) => {
          auth.logout();
          void router.navigate(['/login']);
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
