/** Formularios de acceso y registro, validación de campos y retorno a la ruta solicitada. */

import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Component, inject } from '@angular/core';
import { NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-auth-page',
  standalone: true,
  imports: [NgIf, FormsModule, RouterLink],
  template: `
    <div class="auth-page">
      <section class="auth-story">
        <a class="auth-brand" routerLink="/login"><span class="brand-mark">R</span><strong>ritech</strong></a>
        <div class="story-content">
          <span class="eyebrow">DEL ORIGEN AL DESTINO</span>
          <h1>Exportaciones con<br /><em>origen y propósito.</em></h1>
          <p>Conecta cada lote de café y cacao colombiano con los mercados que valoran su historia.</p>
        </div>
        <div class="story-footer"><span>COLOMBIA → EUROPA</span><span>01 — 04</span></div>
      </section>
      <section class="auth-form-side">
        <div class="mobile-brand"><span class="brand-mark">R</span><strong>ritech</strong></div>
        <div class="auth-card">
          <span class="eyebrow">{{ isRegister ? 'CREA TU CUENTA' : 'BIENVENIDO DE NUEVO' }}</span>
          <h2>{{ isRegister ? 'Únete a Ritech' : 'Inicia sesión' }}</h2>
          <p class="form-intro">{{ isRegister ? 'Registra tu acceso a la plataforma.' : 'Ingresa tus credenciales para continuar.' }}</p>
          <form (ngSubmit)="submit()" #authForm="ngForm">
            <label *ngIf="isRegister">Nombre completo
              <input name="nombre" [(ngModel)]="nombre" required minlength="2" autocomplete="name" placeholder="Tu nombre" />
            </label>
            <label>Correo electrónico
              <input type="email" name="email" [(ngModel)]="email" required email autocomplete="email" placeholder="nombre@empresa.com" />
            </label>
            <label>Contraseña
              <input type="password" name="password" [(ngModel)]="password" required [minlength]="isRegister ? 8 : 1" [autocomplete]="isRegister ? 'new-password' : 'current-password'" placeholder="••••••••" />
              <small *ngIf="isRegister" class="field-hint">Al menos 8 caracteres</small>
            </label>
            <div class="alert error-alert" *ngIf="error">{{ error }}</div>
            <div class="alert success-alert" *ngIf="success">{{ success }}</div>
            <button class="primary-button auth-submit" type="submit" [disabled]="authForm.invalid || loading">
              {{ loading ? 'Procesando…' : (isRegister ? 'Crear cuenta' : 'Entrar a la plataforma') }} <span>→</span>
            </button>
          </form>
          <p class="switch-auth">
            {{ isRegister ? '¿Ya tienes una cuenta?' : '¿Aún no tienes una cuenta?' }}
            <a [routerLink]="isRegister ? '/login' : '/register'">{{ isRegister ? 'Inicia sesión' : 'Regístrate' }}</a>
          </p>
        </div>
        <span class="legal-note">Ritech Export Manager · Trazabilidad de origen</span>
      </section>
    </div>
  `,
  styles: [`
    .auth-page{min-height:100vh;display:grid;grid-template-columns:1fr 1fr;background:#fff}.auth-story{position:relative;overflow:hidden;padding:40px 8%;background:linear-gradient(145deg,rgba(13,42,32,.93),rgba(22,67,48,.82)),radial-gradient(ellipse at 75% 35%,#84a259,#14392c 72%);color:#fff;display:flex;flex-direction:column;justify-content:space-between}.auth-story:after{content:"";position:absolute;inset:auto -12% -25% 35%;height:65%;border-radius:50%;border:1px solid rgba(232,246,213,.13);box-shadow:0 0 0 55px rgba(232,246,213,.035),0 0 0 110px rgba(232,246,213,.025);pointer-events:none}.auth-brand,.mobile-brand{display:flex;align-items:center;gap:12px;color:#fff;text-decoration:none}.auth-brand strong,.mobile-brand strong{font-size:21px;letter-spacing:-.7px}.brand-mark{width:39px;height:39px;border-radius:12px;background:#bedb88;color:#18392b;font-size:23px;font-weight:800;display:grid;place-items:center}.story-content{max-width:520px;position:relative;z-index:1}.eyebrow{font-size:10px;font-weight:700;letter-spacing:1.75px;color:#719950}.auth-story .eyebrow{color:#c6dfa0}.story-content h1{font-size:clamp(38px,5vw,62px);line-height:1.05;letter-spacing:-2.7px;margin:20px 0}.story-content h1 em{font-family:Georgia,serif;font-weight:400;color:#c6dfa0}.story-content p{max-width:405px;color:#d0dfd4;line-height:1.8;font-size:14px}.story-footer{display:flex;justify-content:space-between;font-size:9px;letter-spacing:1.4px;color:#a6c1af}.auth-form-side{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:44px 30px;position:relative}.auth-card{width:min(100%,390px)}.auth-card h2{color:#19392d;font-size:33px;letter-spacing:-1.3px;margin:11px 0 7px}.form-intro{font-size:13px;color:#7a8880;margin:0 0 31px}.auth-card label{display:block;color:#30463a;font-size:12px;font-weight:600;margin:0 0 19px}.auth-card input{display:block;width:100%;margin-top:8px;padding:12px 13px;border:1px solid #dfe6df;border-radius:7px;outline:none;color:#243b30;font:inherit;font-weight:400;transition:.18s}.auth-card input:focus{border-color:#6f9955;box-shadow:0 0 0 3px #edf4e5}.auth-card input::placeholder{color:#aab4ad}.field-hint{display:block;color:#97a39a;font-weight:400;margin-top:7px}.primary-button{background:#1b4935;color:#fff;border:0;border-radius:7px;padding:13px 15px;font-weight:600;cursor:pointer;transition:.18s}.primary-button:hover:not(:disabled){background:#286347;transform:translateY(-1px)}.primary-button:disabled{opacity:.55;cursor:not-allowed}.auth-submit{width:100%;margin-top:3px;text-align:left}.auth-submit span{float:right}.switch-auth{text-align:center;color:#7d8981;font-size:12px;margin:23px 0 0}.switch-auth a{color:#285c3e;text-decoration:none;font-weight:700;margin-left:4px}.legal-note{position:absolute;bottom:24px;color:#9aa59e;font-size:10px}.alert{font-size:12px;border-radius:6px;padding:11px 12px;margin:0 0 13px}.error-alert{background:#fff0ee;color:#aa4035}.success-alert{background:#edf7ef;color:#316841}.mobile-brand{display:none}
    @media(max-width:750px){.auth-page{grid-template-columns:1fr}.auth-story{display:none}.auth-form-side{min-height:100vh;padding:38px 23px 70px}.mobile-brand{display:flex;color:#19392d;margin-bottom:42px}.legal-note{bottom:20px}}
  `],
})
/** Presenta el formulario de registro o acceso según los datos de la ruta actual. */
export class AuthPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly isRegister = this.route.snapshot.data['mode'] === 'register';
  nombre = '';
  email = '';
  password = '';
  loading = false;
  error = '';
  success = this.route.snapshot.queryParamMap.has('registered')
    ? 'Tu cuenta fue creada. Ya puedes iniciar sesión.'
    : '';

  submit(): void {
    this.error = '';
    this.success = '';
    this.loading = true;
    const request: Observable<unknown> = this.isRegister
      ? this.auth.register(this.nombre.trim(), this.email.trim(), this.password)
      : this.auth.login(this.email.trim(), this.password);
    request.subscribe({
      next: () => {
        this.loading = false;
        if (this.isRegister) {
          void this.router.navigate(['/login'], { queryParams: { registered: '1' } });
        } else {
          const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
          void this.router.navigateByUrl(returnUrl || '/dashboard');
        }
      },
      error: (error: HttpErrorResponse) => {
        this.loading = false;
        this.error = this.errorMessage(error);
      },
    });
  }

  private errorMessage(error: HttpErrorResponse): string {
    const detail = error.error?.detail;
    if (typeof detail === 'string') return detail;
    if (error.status === 0) return 'No se pudo conectar con el servidor. Verifica que la API esté disponible.';
    if (error.status === 400 && this.isRegister) return 'No fue posible registrar la cuenta. Revisa el correo y la contraseña.';
    if (error.status === 401) return 'Correo o contraseña incorrectos.';
    return 'Ocurrió un error. Intenta de nuevo.';
  }
}
