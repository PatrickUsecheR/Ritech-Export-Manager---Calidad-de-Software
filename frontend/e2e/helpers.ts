/** Utilidades compartidas de pruebas de navegador: acceso, datos y limpieza. */

import { expect, Page, APIRequestContext } from '@playwright/test';

export const API_URL = 'http://127.0.0.1:8000/api';
export const TEST_PASSWORD = 'Admin123*';

/** Inicia sesión por la API, prepara la sesión del navegador y abre el panel. */
export async function login(page: Page, email: string): Promise<void> {
  const response = await page.request.post(`${API_URL}/auth/login/`, {
    data: { email, password: TEST_PASSWORD },
  });
  expect(response.status()).toBe(200);
  const session = await response.json();
  await page.goto('/login');
  await page.evaluate((auth) => {
    localStorage.setItem('ritech_access', auth.access);
    localStorage.setItem('ritech_refresh', auth.refresh);
    localStorage.setItem('ritech_user', JSON.stringify(auth.usuario));
  }, session);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/dashboard/, { timeout: 15_000 });
}

/** Autentica una solicitud a la API y devuelve el token de acceso. */
export async function tokenFor(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  const response = await request.post(`${API_URL}/auth/login/`, {
    data: { email, password: TEST_PASSWORD },
  });
  expect(response.status()).toBe(200);
  return (await response.json()).access as string;
}

/** Construye la cabecera de autorización requerida por endpoints protegidos. */
export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** Crea un cliente europeo con nombre único y devuelve su identificador. */
export async function createClient(
  request: APIRequestContext,
  token: string,
  name: string,
  country = 'Alemania',
): Promise<number> {
  const vat = `NL${String(Date.now()).slice(-8)}B01`;
  const response = await request.post(`${API_URL}/clientes/`, {
    headers: authHeaders(token),
    data: {
      razon_social: name,
      tax_id_vat: vat,
      pais_destino: country,
      direccion: 'Direccion de prueba',
      puerto_destino: 'Hamburgo',
      email_contacto: 'qa@example.test',
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).id as number;
}

/** Crea un lote de inventario de prueba y devuelve su identificador. */
export async function createLot(
  request: APIRequestContext,
  token: string,
  weight: string,
  productType = 'Café',
): Promise<number> {
  const response = await request.post(`${API_URL}/lotes/`, {
    headers: authHeaders(token),
    data: {
      tipo_producto: productType,
      peso_kg: weight,
      calidad: 'Calidad de prueba',
      fecha_cosecha: '2026-09-01',
      estado: 'Disponible',
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).id as number;
}

/** Consulta un lote y genera la etiqueta que muestra el formulario de órdenes. */
export async function lotOptionLabelFor(
  request: APIRequestContext,
  token: string,
  id: number,
): Promise<string> {
  const response = await request.get(`${API_URL}/lotes/${id}/`, {
    headers: authHeaders(token),
  });
  expect(response.status()).toBe(200);
  const lot = await response.json();
  return `${lot.codigo_lote} · ${lot.tipo_producto} · ${Number(lot.peso_kg).toFixed(2)} kg`;
}

/** Elimina un dato de prueba mediante la API; acepta que ya no exista. */
export async function deleteResource(
  request: APIRequestContext,
  token: string,
  path: string,
  id: number | undefined,
): Promise<void> {
  if (!id) return;
  const response = await request.delete(`${API_URL}/${path}/${id}/`, {
    headers: authHeaders(token),
  });
  expect([204, 404]).toContain(response.status());
}
