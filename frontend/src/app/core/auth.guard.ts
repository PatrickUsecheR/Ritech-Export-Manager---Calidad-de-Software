/** Guardas de rutas para usuarios autenticados, visitantes y páginas por rol. */

import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  return auth.authenticated()
    ? true
    : inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

export const guestGuard: CanActivateFn = () =>
  inject(AuthService).authenticated() ? inject(Router).createUrlTree(['/dashboard']) : true;

export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const roles = route.data['roles'] as string[] | undefined;
  if (!auth.authenticated()) return inject(Router).createUrlTree(['/login']);
  return !roles?.length || roles.includes(auth.user()?.rol ?? '')
    ? true
    : inject(Router).createUrlTree(['/dashboard']);
};
