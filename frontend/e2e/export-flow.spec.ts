/** Pruebas de navegador para crear órdenes, verificar totales y consultar el panel. */

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

test('TEST-06: completes a customer, lot, order and traceability journey', async ({ page, request }) => {
  const token = await tokenFor(request, 'analista@ritech.com');
  const name = `Comprador UI ${Date.now()}`;
  let clientId: number | undefined;
  let lotId: number | undefined;
  let orderId: number | undefined;

  try {
    await login(page, 'analista@ritech.com');
    await page.getByRole('link', { name: 'Clientes UE' }).click();
    await page.getByRole('button', { name: /Nuevo cliente/ }).click();
    await page.getByLabel('Razón social').fill(name);
    await page.getByLabel('Tax ID / VAT').fill(`NL${String(Date.now()).slice(-8)}B01`);
    await page.getByLabel('País de destino').fill('Paises Bajos');
    await page.getByLabel('Dirección').fill('Rotterdam');
    const clientResponse = page.waitForResponse(
      (response) => response.url().endsWith('/api/clientes/') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Crear registro' }).click();
    const client = await (await clientResponse).json();
    clientId = client.id as number;

    await page.getByRole('link', { name: 'Inventario y lotes' }).click();
    await page.getByRole('button', { name: /Registrar lote/ }).click();
    const lotDialog = page.getByRole('dialog', { name: 'Registrar lote' });
    const lotSelects = lotDialog.getByRole('combobox');
    await lotSelects.nth(0).selectOption({ label: 'Café' });
    await lotDialog.getByRole('spinbutton', { name: 'Peso disponible (kg)' }).fill('5000');
    await lotDialog.getByRole('textbox', { name: 'Calidad', exact: true }).fill('Excelsa');
    await lotDialog.getByRole('textbox', { name: 'Fecha de cosecha' }).fill('2026-09-01');
    await lotSelects.nth(3).selectOption({ label: 'Disponible' });
    const createLotButton = lotDialog.getByRole('button', { name: 'Crear registro' });
    await expect(createLotButton).toBeEnabled();
    const lotResponse = page.waitForResponse(
      (response) => response.url().endsWith('/api/lotes/') && response.request().method() === 'POST',
    );
    await createLotButton.click();
    const lot = await (await lotResponse).json();
    lotId = lot.id as number;

    await page.getByRole('link', { name: 'Órdenes de exportación' }).click();
    await page.getByRole('button', { name: /Crear orden/ }).click();
    await page.locator('select[name="cliente"]').selectOption({ label: `${name} · Paises Bajos` });
    await page.locator('[role="dialog"] select').nth(1).selectOption({
      label: `${lot.codigo_lote} · ${lot.tipo_producto} · ${Number(lot.peso_kg).toFixed(2)} kg`,
    });
    await page.getByLabel('Cantidad (kg)').fill('3000');
    await page.getByLabel('EUR/kg').fill('4.50');
    await page.getByLabel('Tasa de cambio · COP/EUR').fill('4500');
    const orderResponse = page.waitForResponse(
      (response) => response.url().endsWith('/api/ordenes/') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Confirmar orden' }).click();
    const orderResponseData = await orderResponse;
    expect(orderResponseData.status()).toBe(201);
    const order = await orderResponseData.json();
    orderId = order.id as number;
    expect(order.valor_total_eur).toBe('13500.00');
    expect(order.valor_total_cop).toBe('60750000.00');

    await page.getByRole('link', { name: /Trazabilidad/ }).click();
    await page.getByLabel('Código de lote u orden').fill(order.codigo_orden);
    await page.getByRole('button', { name: /Consultar origen/ }).click();
    await expect(page.getByRole('heading', { name: order.codigo_orden })).toBeVisible();
    await expect(page.getByText('Orden confirmada y en preparación de despacho')).toBeVisible();
  } finally {
    await deleteResource(request, token, 'ordenes', orderId);
    await deleteResource(request, token, 'lotes', lotId);
    await deleteResource(request, token, 'clientes', clientId);
  }
});

test('TEST-16: two lots show the exact EUR and COP total in the order screen', async ({ page, request }) => {
  const token = await tokenFor(request, 'analista@ritech.com');
  const clientName = `Orden UI ${Date.now()}`;
  const clientId = await createClient(request, token, clientName);
  const firstLot = await createLot(request, token, '1500.00');
  const secondLot = await createLot(request, token, '1000.00', 'Cacao');
  const firstLotLabel = await lotOptionLabelFor(request, token, firstLot);
  const secondLotLabel = await lotOptionLabelFor(request, token, secondLot);
  let orderId: number | undefined;

  try {
    await login(page, 'analista@ritech.com');
    await page.getByRole('link', { name: 'Órdenes de exportación' }).click();
    await page.getByRole('button', { name: /Crear orden/ }).click();
    await page.locator('select[name="cliente"]').selectOption({ label: `${clientName} · Alemania` });
    await page.getByLabel('Lote').nth(0).selectOption({ label: firstLotLabel });
    await page.getByLabel('Cantidad (kg)').nth(0).fill('1000');
    await page.getByLabel('EUR/kg').nth(0).fill('5.00');
    await page.getByRole('button', { name: 'Añadir lote' }).click();
    await page.locator('[role="dialog"] select').nth(2).selectOption({ label: secondLotLabel });
    await page.getByLabel('Cantidad (kg)').nth(1).fill('500');
    await page.getByLabel('EUR/kg').nth(1).fill('6.00');
    await page.getByLabel('Tasa de cambio · COP/EUR').fill('4450');
    await expect(page.getByText('€8,000.00')).toBeVisible();
    await expect(page.getByText(/35,600,000/)).toBeVisible();

    const responsePromise = page.waitForResponse(
      (response) => response.url().endsWith('/api/ordenes/') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Confirmar orden' }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    const order = await response.json();
    orderId = order.id as number;
    expect(order.valor_total_eur).toBe('8000.00');
    expect(order.valor_total_cop).toBe('35600000.00');
  } finally {
    await deleteResource(request, token, 'ordenes', orderId);
    await deleteResource(request, token, 'lotes', firstLot);
    await deleteResource(request, token, 'lotes', secondLot);
    await deleteResource(request, token, 'clientes', clientId);
  }
});

test('TEST-18: dashboard shows export KPIs and destination-country summary', async ({ page, request }) => {
  const token = await tokenFor(request, 'analista@ritech.com');
  await login(page, 'analista@ritech.com');
  await expect(page.getByText('ÓRDENES ACTIVAS')).toBeVisible();
  await expect(page.getByText('VALOR EXPORTADO')).toBeVisible();
  const summary = await request.get(`${API_URL}/dashboard/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(summary.status()).toBe(200);
  const data = await summary.json();
  expect(data.exportaciones_por_pais).toBeTruthy();
  await expect(page.getByText('Exportaciones por país')).toBeVisible();
});
