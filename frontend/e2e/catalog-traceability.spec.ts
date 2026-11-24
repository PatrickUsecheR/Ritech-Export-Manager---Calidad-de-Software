/** Flujos de navegador para catálogo de proveedores/productos y trazabilidad pública. */

import { expect, test } from '@playwright/test';
import { API_URL, authHeaders, createClient, createLot, deleteResource, login, tokenFor } from './helpers';

test('TEST-15: catalog records can be searched and supplier origin can be entered', async ({ page, request }) => {
  const token = await tokenFor(request, 'analista@ritech.com');
  const supplierName = `Finca QA ${Date.now()}`;
  const productName = `Cafe QA ${Date.now()}`;
  const supplier = await request.post(`${API_URL}/proveedores/`, {
    headers: authHeaders(token),
    data: {
      razon_social: supplierName,
      nit: `89${String(Date.now()).slice(-8)}-4`,
      municipio_origen: 'Huila',
    },
  });
  const product = await request.post(`${API_URL}/productos/`, {
    headers: authHeaders(token),
    data: {
      nombre: productName,
      tipo_producto: 'Café',
      descripcion: 'Registro de prueba',
      precio_unitario_eur: '5.00',
      activo: 'Activo',
    },
  });
  expect(supplier.status()).toBe(201);
  expect(product.status()).toBe(201);
  const supplierRecord = await supplier.json();
  const productRecord = await product.json();

  try {
    await login(page, 'analista@ritech.com');
    await page.getByRole('link', { name: 'Proveedores' }).click();
    await page.getByRole('textbox', { name: 'Buscar' }).fill(supplierName);
    await expect(page.getByRole('row').filter({ hasText: supplierName })).toBeVisible();

    await page.getByRole('link', { name: 'Productos' }).click();
    await page.getByRole('textbox', { name: 'Buscar' }).fill(productName);
    await expect(page.getByRole('row').filter({ hasText: productName })).toBeVisible();

    await page.getByRole('link', { name: 'Proveedores' }).click();
    await page.getByRole('button', { name: /Nuevo proveedor/ }).click();
    await expect(page.getByLabel('Municipio de origen')).toBeVisible();
  } finally {
    await request.delete(`${API_URL}/proveedores/${supplierRecord.id}/`, {
      headers: authHeaders(token),
    });
    await request.delete(`${API_URL}/productos/${productRecord.id}/`, {
      headers: authHeaders(token),
    });
  }
});

test('TEST-17: quality staff adds a shipment event visible in the public timeline', async ({ page, request }) => {
  const analystToken = await tokenFor(request, 'analista@ritech.com');
  const qualityToken = await tokenFor(request, 'calidad@ritech.com');
  const customerId = await createClient(request, analystToken, `Trace QA ${Date.now()}`);
  const lotId = await createLot(request, analystToken, '80.00');
  let orderId: number | undefined;

  try {
    const orderResponse = await request.post(`${API_URL}/ordenes/`, {
      headers: authHeaders(analystToken),
      data: {
        cliente: customerId,
        fecha_envio: '2026-11-30',
        tasa_cambio_cop: '4500.00',
        detalles: [{
          lote: lotId,
          cantidad_kg: '10.00',
          precio_unitario_eur: '4.50',
        }],
      },
    });
    expect(orderResponse.status()).toBe(201);
    const order = await orderResponse.json();
    orderId = order.id as number;

    await login(page, 'calidad@ritech.com');
    await page.goto('/admin/traceability');
    await page.getByLabel('Código de lote u orden a actualizar').fill(order.codigo_orden);
    await page.getByRole('button', { name: /Consultar código/ }).click();
    await expect(page.getByRole('heading', { name: order.codigo_orden })).toBeVisible();
    await page.getByLabel('Hito').selectOption({ label: 'En tránsito' });
    await page.getByLabel('Ubicación').fill('Puerto de Rotterdam');
    await page.getByLabel('Descripción').fill('El envío llegó al puerto europeo.');
    const eventResponse = page.waitForResponse(
      (response) => response.url().includes(`/api/trazabilidad/${order.codigo_orden}/eventos/`)
        && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /Registrar hito/ }).click();
    expect((await eventResponse).status()).toBe(201);

    await page.goto('/traceability');
    await page.getByLabel('Código de lote u orden').fill(order.codigo_orden);
    await page.getByRole('button', { name: /Consultar origen/ }).click();
    await expect(page.getByText('En tránsito')).toBeVisible();
    await expect(page.getByText('Puerto de Rotterdam')).toBeVisible();
    const publicTrace = await request.get(`${API_URL}/trazabilidad/${order.codigo_orden}/`);
    expect((await publicTrace.json()).eventos.some(
      (event: { titulo: string; ubicacion: string }) =>
        event.titulo === 'En tránsito' && event.ubicacion === 'Puerto de Rotterdam',
    )).toBe(true);
  } finally {
    await deleteResource(request, analystToken, 'ordenes', orderId);
    await deleteResource(request, analystToken, 'lotes', lotId);
    await deleteResource(request, analystToken, 'clientes', customerId);
  }
});
