"""Escenarios del plan de QA para catálogo, certificados y trazabilidad."""

import tempfile
import time
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status

from api.models import (
    Certificacion,
    ClienteUE,
    Lote,
    OrdenExportacion,
    OrdenLote,
    TrazabilidadEnvio,
)
from .support import PlanTestCase


class CatalogTraceabilityPlanTests(PlanTestCase):
    """Verifica reglas del catálogo, carga de certificados, indicadores y trazabilidad."""

    def test_test_02_invalid_european_vat_is_rejected(self):
        self.as_user(self.analista)
        response = self.api.post('/api/clientes/', {
            'razon_social': 'EU Coffee Import',
            'tax_id_vat': 'INVALID_123',
            'pais_destino': 'Alemania',
            'direccion': 'Berlin',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('tax_id_vat', response.data)

    def test_test_05_valid_pdf_is_saved_and_has_download_url(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        media_override = override_settings(MEDIA_ROOT=temp.name)
        media_override.enable()
        self.addCleanup(media_override.disable)
        lot = self.make_lot()
        self.as_user(self.calidad)
        response = self.api.post('/api/certificaciones/', {
            'lote': lot.pk,
            'tipo_certificado': 'Fitosanitario',
            'archivo_pdf': SimpleUploadedFile(
                'cert_fitosanitario_2026.pdf',
                b'%PDF-1.4\\nCertificado de prueba\\n%%EOF',
                content_type='application/pdf',
            ),
        }, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        saved = Certificacion.objects.get(pk=response.data['id'])
        self.assertTrue(saved.archivo_pdf.storage.exists(saved.archivo_pdf.name))
        self.assertIn('.pdf', response.data['archivo_pdf'])

    def test_test_10_duplicate_supplier_nit_is_rejected(self):
        self.make_supplier(nit='900123456-1')
        self.as_user(self.analista)
        response = self.api.post('/api/proveedores/', {
            'razon_social': 'Otra finca',
            'nit': '900123456-1',
            'municipio_origen': 'Huila',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_test_11_inactive_product_cannot_be_used_for_a_new_lot(self):
        supplier = self.make_supplier()
        product = self.make_product(active='Inactivo')
        self.as_user(self.analista)
        response = self.api.post('/api/lotes/', {
            'tipo_producto': 'Café',
            'producto': product.pk,
            'proveedor': supplier.pk,
            'peso_kg': '100.00',
            'calidad': 'Excelsa',
            'fecha_cosecha': '2026-09-01',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_test_12_empty_dashboard_uses_zero_totals(self):
        self.as_user(self.analista)
        response = self.api.get('/api/dashboard/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['valor_total_eur'], Decimal('0.00'))
        self.assertEqual(response.data['valor_total_cop'], Decimal('0.00'))
        self.assertIsNotNone(response.data['cafe_exportado_kg'])
        self.assertIsNotNone(response.data['cacao_exportado_kg'])

    def test_test_15_supplier_and_product_are_saved_and_listed(self):
        self.as_user(self.analista)
        supplier = self.api.post('/api/proveedores/', {
            'razon_social': 'Finca El Paraiso QA',
            'nit': '890456123-4',
            'municipio_origen': 'Huila',
            'contacto': 'Agente QA',
        }, format='json')
        product = self.api.post('/api/productos/', {
            'nombre': 'Cafe Castillo Supremo QA',
            'tipo_producto': 'Café',
            'descripcion': 'Producto de prueba',
            'precio_unitario_eur': '5.00',
            'activo': 'Activo',
        }, format='json')
        self.assertEqual(supplier.status_code, status.HTTP_201_CREATED, supplier.data)
        self.assertEqual(product.status_code, status.HTTP_201_CREATED, product.data)
        self.assertTrue(any(row['nit'] == '890456123-4' for row in self.api.get('/api/proveedores/').data))
        self.assertTrue(any(row['nombre'] == 'Cafe Castillo Supremo QA' for row in self.api.get('/api/productos/').data))

    def test_test_17_order_trace_events_are_public_and_chronological(self):
        client = self.make_client()
        lot = self.make_lot()
        order = OrdenExportacion.objects.create(
            cliente=client,
            fecha_envio='2026-11-30',
            valor_total_eur=Decimal('45.00'),
            tasa_cambio_cop=Decimal('4500.00'),
        )
        OrdenLote.objects.create(
            orden=order,
            lote=lot,
            cantidad_kg=Decimal('10.00'),
            precio_unitario_eur=Decimal('4.50'),
        )
        self.as_user(self.calidad)
        for title, location, date in (
            ('Salida de finca', 'Huila', '2026-11-20T09:00:00Z'),
            ('Puerto de Rotterdam', 'Rotterdam', '2026-11-22T09:00:00Z'),
        ):
            created = self.api.post(
                f'/api/trazabilidad/{order.codigo_orden}/eventos/',
                {
                    'titulo': title,
                    'ubicacion': location,
                    'descripcion': 'Evento QA',
                    'fecha': date,
                },
                format='json',
            )
            self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        public = self.api.get(f'/api/trazabilidad/{order.codigo_orden}/')
        self.assertEqual(public.status_code, status.HTTP_200_OK)
        self.assertEqual(public.data['codigo_orden'], order.codigo_orden)
        self.assertEqual(
            [event['titulo'] for event in public.data['eventos']],
            ['Salida de finca', 'Puerto de Rotterdam'],
        )

    def test_test_18_dashboard_groups_export_value_by_country(self):
        client = self.make_client()
        lot = self.make_lot()
        order = OrdenExportacion.objects.create(
            cliente=client,
            fecha_envio='2026-11-30',
            valor_total_eur=Decimal('100.00'),
            tasa_cambio_cop=Decimal('4500.00'),
        )
        OrdenLote.objects.create(
            orden=order,
            lote=lot,
            cantidad_kg=Decimal('20.00'),
            precio_unitario_eur=Decimal('5.00'),
        )
        self.as_user(self.analista)
        dashboard = self.api.get('/api/dashboard/')
        self.assertEqual(dashboard.status_code, status.HTTP_200_OK)
        self.assertEqual(dashboard.data['exportaciones_por_pais'][0]['pais_destino'], 'Alemania')
        self.assertEqual(dashboard.data['exportaciones_por_pais'][0]['valor_total_eur'], Decimal('100.00'))

    def test_test_20_certificate_rejects_fake_and_oversized_pdf_files(self):
        lot = self.make_lot()
        self.as_user(self.calidad)
        for name, content in (
            ('programa.pdf', b'MZ executable content'),
            ('grande.pdf', b'%PDF-1.4\n' + b'x' * (5 * 1024 * 1024) + b'\n%%EOF'),
        ):
            response = self.api.post('/api/certificaciones/', {
                'lote': lot.pk,
                'tipo_certificado': 'Fitosanitario',
                'archivo_pdf': SimpleUploadedFile(
                    name,
                    content,
                    content_type='application/pdf',
                ),
            }, format='multipart')
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn('archivo_pdf', response.data)

    def test_test_22_dashboard_summary_returns_100_orders_within_500ms(self):
        client = self.make_client()
        orders = [
            OrdenExportacion(
                codigo_orden=f'PERF-{index:04d}',
                cliente=client,
                fecha_envio='2026-11-30',
                valor_total_eur=Decimal('100.00'),
                tasa_cambio_cop=Decimal('4500.00'),
                estado='Confirmada',
            )
            for index in range(100)
        ]
        OrdenExportacion.objects.bulk_create(orders)
        self.as_user(self.analista)

        elapsed = []
        for _ in range(3):
            started = time.perf_counter()
            response = self.api.get('/api/dashboard/resumen/')
            elapsed.append(time.perf_counter() - started)
            self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertLess(max(elapsed), 0.5, f'Response times were {elapsed}')

    def test_test_26_delivery_updates_dashboard_and_traceability(self):
        client = self.make_client()
        lot = self.make_lot()
        self.as_user(self.analista)
        created = self.api.post('/api/ordenes/', self.order_payload(
            client,
            [{'lote': lot.pk, 'cantidad_kg': '10.00', 'precio_unitario_eur': '5.00'}],
        ), format='json')
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        code = created.data['codigo_orden']
        public = self.api.get(f'/api/trazabilidad/{code}/')
        self.assertIn(
            'Orden confirmada y en preparación de despacho',
            [event['descripcion'] for event in public.data['eventos']],
        )
        updated = self.api.patch(
            f"/api/ordenes/{created.data['id']}/",
            {'estado': 'Entregada'},
            format='json',
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK, updated.data)
        dashboard = self.api.get('/api/dashboard/')
        self.assertEqual(dashboard.status_code, status.HTTP_200_OK)
        self.assertTrue(any(
            country['pais_destino'] == 'Alemania'
            for country in dashboard.data['exportaciones_por_pais']
        ))

    def test_test_06_complete_export_flow_returns_confirmed_order_and_trace(self):
        self.as_user(self.analista)
        customer = self.api.post('/api/clientes/', {
            'razon_social': 'Comprador QA',
            'tax_id_vat': 'NL987654321B01',
            'pais_destino': 'Paises Bajos',
            'direccion': 'Rotterdam',
        }, format='json')
        self.assertEqual(customer.status_code, status.HTTP_201_CREATED, customer.data)
        supplier = self.make_supplier()
        product = self.make_product()
        lot_response = self.api.post('/api/lotes/', {
            'tipo_producto': 'Café',
            'producto': product.pk,
            'proveedor': supplier.pk,
            'peso_kg': '5000.00',
            'calidad': 'Excelsa',
            'fecha_cosecha': '2026-09-01',
        }, format='json')
        self.assertEqual(lot_response.status_code, status.HTTP_201_CREATED, lot_response.data)
        order = self.api.post('/api/ordenes/', self.order_payload(
            type('Customer', (), {'pk': customer.data['id']})(),
            [{
                'lote': lot_response.data['id'],
                'cantidad_kg': '3000.00',
                'precio_unitario_eur': '4.50',
            }],
        ), format='json')
        self.assertEqual(order.status_code, status.HTTP_201_CREATED, order.data)
        self.assertEqual(order.data['estado'], 'Confirmada')
        trace = self.api.get(f"/api/trazabilidad/{order.data['codigo_orden']}/")
        self.assertEqual(trace.status_code, status.HTTP_200_OK)
        self.assertTrue(trace.data['eventos'])
