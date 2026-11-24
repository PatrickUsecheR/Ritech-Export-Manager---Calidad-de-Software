"""Escenarios del plan de QA para inventario, totales de órdenes y concurrencia."""

from decimal import Decimal
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipUnless

from django.db import close_old_connections, connection
from django.test import TransactionTestCase
from rest_framework import status
from rest_framework.test import APIClient

from api.models import ClienteUE, Lote, OrdenExportacion, Producto, Proveedor, Usuario
from .support import PlanTestCase


class InventoryOrderPlanTests(PlanTestCase):
    """Prueba creación de lotes, reserva de inventario y cálculos EUR/COP."""

    def test_test_03_create_lot_and_read_it_back(self):
        supplier = self.make_supplier()
        product = self.make_product()
        self.as_user(self.analista)
        created = self.api.post('/api/lotes/', {
            'tipo_producto': 'Café',
            'producto': product.pk,
            'proveedor': supplier.pk,
            'peso_kg': '5000.00',
            'calidad': 'Excelsa',
            'fecha_cosecha': '2026-09-01',
        }, format='json')
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        read_back = self.api.get(f"/api/lotes/{created.data['id']}/")
        self.assertEqual(read_back.status_code, status.HTTP_200_OK)
        self.assertEqual(read_back.data['peso_kg'], '5000.00')

    def test_test_04_order_reserves_partial_lot_stock(self):
        client = self.make_client()
        lot = self.make_lot()
        self.as_user(self.analista)
        response = self.api.post('/api/ordenes/', self.order_payload(
            client,
            [{'lote': lot.pk, 'cantidad_kg': '3000.00', 'precio_unitario_eur': '4.50'}],
        ), format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        lot.refresh_from_db()
        self.assertEqual(lot.peso_kg, Decimal('2000.00'))
        self.assertEqual(lot.estado, 'Reservado')

    def test_test_07_decimal_eur_and_cop_calculation(self):
        client = self.make_client()
        lot = self.make_lot(weight='5000.00')
        self.as_user(self.analista)
        response = self.api.post('/api/ordenes/', self.order_payload(
            client,
            [{'lote': lot.pk, 'cantidad_kg': '2500.00', 'precio_unitario_eur': '4.50'}],
            rate='4500.00',
        ), format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['valor_total_eur'], '11250.00')
        self.assertEqual(response.data['valor_total_cop'], '50625000.00')

    def test_test_16_two_lot_order_saves_exact_eur_and_cop_totals(self):
        client = self.make_client()
        first = self.make_lot(weight='1500.00')
        second = self.make_lot(weight='1000.00')
        self.as_user(self.analista)
        response = self.api.post('/api/ordenes/', self.order_payload(
            client,
            [
                {'lote': first.pk, 'cantidad_kg': '1000.00', 'precio_unitario_eur': '5.00'},
                {'lote': second.pk, 'cantidad_kg': '500.00', 'precio_unitario_eur': '6.00'},
            ],
            rate='4450.00',
        ), format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['valor_total_eur'], '8000.00')
        self.assertEqual(response.data['valor_total_cop'], '35600000.00')
        self.assertEqual(first.__class__.objects.get(pk=first.pk).peso_kg, Decimal('500.00'))
        self.assertEqual(second.__class__.objects.get(pk=second.pk).peso_kg, Decimal('500.00'))


@skipUnless(
    connection.vendor == 'postgresql',
    'La prueba de concurrencia requiere PostgreSQL para comprobar los bloqueos.',
)
class OrderConcurrencyPlanTests(TransactionTestCase):
    """Comprueba que solicitudes simultáneas no vendan más que el inventario disponible."""

    reset_sequences = True

    def setUp(self):
        self.user = Usuario.objects.create_user(
            email='qa-concurrency@example.test',
            nombre='QA Concurrencia',
            password='QaPass123!',
            rol='Analista',
        )
        self.client_record = ClienteUE.objects.create(
            razon_social='Importadora concurrencia',
            tax_id_vat='DE123456789',
            pais_destino='Alemania',
            direccion='Hamburgo',
        )
        supplier = Proveedor.objects.create(razon_social='Finca concurrencia', nit='900123456-8')
        product = Producto.objects.create(
            nombre='Café concurrencia',
            tipo_producto='Café',
            precio_unitario_eur='5.00',
        )
        self.lot = Lote.objects.create(
            tipo_producto='Café',
            producto=product,
            proveedor=supplier,
            peso_kg='100.00',
            calidad='Exportación',
            fecha_cosecha='2026-09-01',
        )

    def test_test_21_two_orders_cannot_reserve_more_stock_than_available(self):
        barrier = Barrier(2)

        def place_order():
            close_old_connections()
            try:
                api = APIClient()
                api.force_authenticate(user=self.user)
                barrier.wait(timeout=10)
                return api.post('/api/ordenes/', {
                    'cliente': self.client_record.pk,
                    'fecha_envio': '2026-11-30',
                    'tasa_cambio_cop': '4500.00',
                    'detalles': [{
                        'lote': self.lot.pk,
                        'cantidad_kg': '70.00',
                        'precio_unitario_eur': '5.00',
                    }],
                }, format='json').status_code
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lambda _: place_order(), range(2)))

        self.assertCountEqual(results, [status.HTTP_201_CREATED, status.HTTP_400_BAD_REQUEST])
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.peso_kg, Decimal('30.00'))
        self.assertEqual(OrdenExportacion.objects.count(), 1)
