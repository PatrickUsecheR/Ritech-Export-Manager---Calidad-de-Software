/** Pruebas de navegador de roles de usuario y permisos aplicados por la API. */

import { expect, test } from '@playwright/test';
import { API_URL, authHeaders, login, tokenFor } from './helpers';

test('TEST-13: changing a role updates the user menu after sign-in', async ({ page, request }) => {
  const adminToken = await tokenFor(request, 'admin@ritech.com');
  const usersResponse = await request.get(`${API_URL}/usuarios/`, {
    headers: authHeaders(adminToken),
  });
  const users = await usersResponse.json();
  const analyst = users.find((user: { email: string }) => user.email === 'analista@ritech.com');
  expect(analyst).toBeTruthy();

  try {
    await login(page, 'admin@ritech.com');
    await page.getByRole('link', { name: 'Usuarios' }).click();
    const row = page.getByRole('row').filter({ hasText: 'analista@ritech.com' });
    await row.getByRole('button', { name: new RegExp(`Editar ${analyst.id}`) }).click();
    await page.getByLabel('Rol').selectOption('Calidad');
    const updatePromise = page.waitForResponse(
      (response) => response.url().endsWith(`/api/usuarios/${analyst.id}/`) && response.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    expect((await updatePromise).status()).toBe(200);

    await page.getByRole('button', { name: /Cerrar sesión/ }).click();
    await login(page, 'analista@ritech.com');
    await expect(page.locator('.user-info')).toContainText('Calidad');
    await expect(page.getByRole('link', { name: 'Órdenes de exportación' })).toBeHidden();
    await expect(page.getByRole('link', { name: 'Certificados' })).toBeVisible();
  } finally {
    await request.patch(`${API_URL}/usuarios/${analyst.id}/`, {
      headers: authHeaders(adminToken),
      data: { rol: 'Analista' },
    });
  }
});

test('TEST-14: disabling create permission hides the create button and blocks the API', async ({ page, request }) => {
  const adminToken = await tokenFor(request, 'admin@ritech.com');
  const analystToken = await tokenFor(request, 'analista@ritech.com');
  const permissionsResponse = await request.get(`${API_URL}/permisos/`, {
    headers: authHeaders(adminToken),
  });
  const permissions = await permissionsResponse.json();
  const grant = permissions.find(
    (permission: { rol: string; recurso: string }) =>
      permission.rol === 'Analista' && permission.recurso === 'clientes',
  );
  expect(grant).toBeTruthy();
  const permissionUpdate = await request.patch(`${API_URL}/permisos/${grant.id}/`, {
    headers: authHeaders(adminToken),
    data: { ...grant, puede_crear: false },
  });
  expect(permissionUpdate.status()).toBe(200);

  try {
    await login(page, 'analista@ritech.com');
    await page.getByRole('link', { name: 'Clientes UE' }).click();
    const denied = await request.post(`${API_URL}/clientes/`, {
      headers: authHeaders(analystToken),
      data: {
        razon_social: `Cliente bloqueado ${Date.now()}`,
        tax_id_vat: `FR${String(Date.now()).slice(-10)}`,
        pais_destino: 'Francia',
        direccion: 'Paris',
      },
    });
    expect(denied.status()).toBe(403);
    await expect.soft(page.getByRole('button', { name: /Nuevo cliente/ })).toBeHidden();
  } finally {
    await request.patch(`${API_URL}/permisos/${grant.id}/`, {
      headers: authHeaders(adminToken),
      data: { ...grant },
    });
  }
});
