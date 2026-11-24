/** Pruebas adicionales de navegador del diseño adaptable y ciclo de exportación. */

import { expect, test } from '@playwright/test';
import {
  API_URL,
  createClient,
  createLot,
  deleteResource,
  login,
  lotOptionLabelFor,
  tokenFor,
} from './helpers';

test('TEST-23: public traceability is available without a signed-in session', async ({ page }) => {
  await page.goto('/traceability');
  await expect(page.getByRole('heading', { name: 'Sigue el origen de tu producto' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('ritech_access'))).toBeNull();

  await page.getByLabel('Código de lote u orden').fill('EXP-2026-001');
  await page.getByRole('button', { name: /Consultar origen/ }).click();

  await expect(page.getByRole('heading', { name: 'EXP-2026-001' })).toBeVisible();
  await expect(page.getByText('Cosecha registrada')).toBeVisible();
});

test('TEST-24: dashboard fits desktop and tablet screens', async ({ page }) => {
  await login(page, 'analista@ritech.com');
  await expect(page.getByRole('heading', { name: 'Exportaciones por país' })).toBeVisible();

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(viewport);
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflows, `Unexpected horizontal overflow at ${viewport.width}px`).toBe(false);
  }
});

test('TEST-25: quality user creates supplier, product, lot and certificate', async ({ page, request }) => {
  const token = await tokenFor(request, 'calidad@ritech.com');
  const suffix = Date.now();
  const supplierName = `Proveedor Calidad ${suffix}`;
  const nit = `89${String(suffix).slice(-8)}-5`;
  const productName = `Cafe Calidad ${suffix}`;
  let supplierId: number | undefined;
  let productId: number | undefined;
  let lotId: number | undefined;
  let certificateId: number | undefined;

  try {
    await login(page, 'calidad@ritech.com');
    await page.getByRole('link', { name: 'Proveedores' }).click();
    await page.getByRole('button', { name: /Nuevo proveedor/ }).click();
    await page.getByLabel('Razón social').fill(supplierName);
    await page.getByLabel('NIT / identificación').fill(nit);
    await page.getByLabel('Municipio de origen').fill('Pitalito');
    const supplierResponse = page.waitForResponse(
      (response) => response.url().endsWith('/api/proveedores/')
        && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Crear registro' }).click();
    const supplier = await (await supplierResponse).json();
    supplierId = supplier.id as number;

    await page.getByRole('link', { name: 'Productos' }).click();
    await page.getByRole('button', { name: /Nuevo producto/ }).click();
    await page.getByLabel('Nombre del producto').fill(productName);
    await page.getByRole('combobox').first().selectOption({ label: 'Café' });
    await expect(page.getByRole('combobox').first()).toHaveValue(/Café/);
    await page.getByLabel('Descripción').fill('Producto de prueba para exportación.');
    await page.getByLabel('Precio de referencia (EUR/kg)').fill('5.00');
    const productResponse = page.waitForResponse(
      (response) => response.url().endsWith('/api/productos/')
        && response.request().method() === 'POST',
    );
    const createProductButton = page.getByRole('button', { name: 'Crear registro' });
    await expect(createProductButton).toBeEnabled();
    await createProductButton.click();
    const product = await (await productResponse).json();
    productId = product.id as number;

    await page.getByRole('link', { name: 'Inventario y lotes' }).click();
    await page.getByRole('button', { name: /Registrar lote/ }).click();
    await page.getByLabel('Producto del catálogo').selectOption({ label: `${productName} · Café` });
    await page.getByLabel('Proveedor').selectOption({ label: `${supplierName} · ${nit}` });
    await page.getByLabel('Peso disponible (kg)').fill('100');
    await page.getByLabel('Calidad', { exact: true }).fill('Grado exportación');
    await page.getByLabel('Fecha de cosecha').fill('2026-09-01');
    const lotStateSelect = page.locator('[role="dialog"] select').last();
    await lotStateSelect.selectOption({ label: 'Disponible' }, { timeout: 5_000 });
    await expect(lotStateSelect).toHaveValue(/Disponible/);
    const lotResponse = page.waitForResponse(
      (response) => response.url().endsWith('/api/lotes/')
        && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Crear registro' }).click();
    const lot = await (await lotResponse).json();
    lotId = lot.id as number;

    await page.getByRole('link', { name: 'Certificados' }).click();
    await page.getByRole('button', { name: /Subir certificado/ }).click();
    const certificateDialog = page.getByRole('dialog', { name: 'Subir certificado' });
    const certificateSelects = certificateDialog.getByRole('combobox');
    await certificateSelects.nth(0).selectOption(
      { label: await lotOptionLabelFor(request, token, lotId) },
      { timeout: 5_000 },
    );
    await certificateSelects.nth(1).selectOption(
      { label: 'Fitosanitario' },
      { timeout: 5_000 },
    );
    await certificateDialog.locator('input[type="file"]').setInputFiles({
      name: 'certificado-prueba.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\nCertificado de prueba\n%%EOF'),
    });
    const createCertificateButton = certificateDialog.getByRole('button', {
      name: 'Crear registro',
    });
    await expect(createCertificateButton).toBeEnabled({ timeout: 5_000 });
    const certificateResponse = page.waitForResponse(
      (response) => response.url().endsWith('/api/certificaciones/')
        && response.request().method() === 'POST',
    );
    await createCertificateButton.click();
    const certificate = await (await certificateResponse).json();
    certificateId = certificate.id as number;
    await expect(
      page.getByRole('row')
        .filter({ hasText: lot.codigo_lote as string })
        .filter({ hasText: 'Fitosanitario' }),
    ).toBeVisible();
  } finally {
    await deleteResource(request, token, 'certificaciones', certificateId);
    await deleteResource(request, token, 'lotes', lotId);
    await deleteResource(request, token, 'productos', productId);
    await deleteResource(request, token, 'proveedores', supplierId);
  }
});

test('TEST-26: delivered order appears in public trace and country dashboard', async ({ page, request }) => {
  const token = await tokenFor(request, 'analista@ritech.com');
  const clientName = `Entrega UI ${Date.now()}`;
  const clientId = await createClient(request, token, clientName, 'Francia');
  const lotId = await createLot(request, token, '100.00');
  const lotLabel = await lotOptionLabelFor(request, token, lotId);
  let orderId: number | undefined;

  try {
    await login(page, 'analista@ritech.com');
    await page.getByRole('link', { name: 'Órdenes de exportación' }).click();
    await page.getByRole('button', { name: /Crear orden/ }).click();
    await page.locator('select[name="cliente"]').selectOption({ label: `${clientName} · Francia` });
    const orderLotSelect = page.locator('[role="dialog"] select').nth(1);
    await orderLotSelect.selectOption({ label: lotLabel }, { timeout: 5_000 });
    await expect(orderLotSelect.locator('option:checked')).toHaveText(lotLabel);
    await page.getByLabel('Cantidad (kg)').fill('10');
    await page.getByLabel('EUR/kg').fill('5');
    const createResponse = page.waitForResponse(
      (response) => response.url().endsWith('/api/ordenes/')
        && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Confirmar orden' }).click();
    const created = await createResponse;
    expect(created.status()).toBe(201);
    const order = await created.json();
    orderId = order.id as number;

    const row = page.getByRole('row').filter({ hasText: order.codigo_orden as string });
    const updateResponsePromise = page.waitForResponse(
      (response) => response.url().includes(`/api/ordenes/${orderId}/`)
        && response.request().method() === 'PATCH',
    );
    await row.getByRole('combobox').selectOption({ label: 'Entregada' });
    const updateResponse = await updateResponsePromise;
    expect(updateResponse.status()).toBe(200);

    await page.getByRole('link', { name: /Dashboard/ }).click();
    await expect(page.getByRole('heading', { name: 'Exportaciones por país' })).toBeVisible();
    await expect(page.locator('.country-row').filter({ hasText: 'Francia' })).toBeVisible();

    await page.getByRole('link', { name: /Trazabilidad/ }).click();
    await page.getByLabel('Código de lote u orden').fill(order.codigo_orden as string);
    await page.getByRole('button', { name: /Consultar origen/ }).click();
    await expect(page.getByText('Orden confirmada y en preparación de despacho')).toBeVisible();
  } finally {
    await deleteResource(request, token, 'ordenes', orderId);
    await deleteResource(request, token, 'lotes', lotId);
    await deleteResource(request, token, 'clientes', clientId);
  }
});
