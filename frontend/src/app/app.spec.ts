/** Pruebas básicas de renderizado del componente raíz de Angular. */

import { TestBed } from '@angular/core/testing';
import { appConfig } from './app.config';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: appConfig.providers,
    }).compileComponents();
  });

  it('renders the application shell for an unauthenticated visitor', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.main-area.auth-layout')).not.toBeNull();
  });
});
