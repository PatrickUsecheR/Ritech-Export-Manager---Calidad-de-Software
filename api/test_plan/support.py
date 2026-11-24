"""Datos y utilidades compartidos por los escenarios de API del plan de QA."""

from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from api.models import ClienteUE, Lote, Producto, Proveedor, Usuario


class PlanTestCase(TestCase):
    """Crea usuarios por rol y datos reutilizables de catálogo y órdenes."""

    def setUp(self):
        self.api = APIClient()
        self.admin = Usuario.objects.create_superuser(
            email='qa-admin@example.test',
            nombre='QA Admin',
            password='QaPass123!',
        )
        self.analista = Usuario.objects.create_user(
            email='qa-analista@example.test',
            nombre='QA Analista',
            password='QaPass123!',
            rol='Analista',
        )
        self.calidad = Usuario.objects.create_user(
            email='qa-calidad@example.test',
            nombre='QA Calidad',
            password='QaPass123!',
            rol='Calidad',
        )
        self.cliente_user = Usuario.objects.create_user(
            email='qa-cliente@example.test',
            nombre='QA Cliente',
            password='QaPass123!',
            rol='Cliente',
        )

    def as_user(self, user):
        """Autentica el cliente de prueba como el usuario indicado."""
        self.api.force_authenticate(user=user)

    def make_supplier(self, nit='900123456-7'):
        """Crea un proveedor con un identificador determinista para pruebas."""
        return Proveedor.objects.create(
            razon_social='Finca QA',
            nit=nit,
            contacto='Contacto QA',
            telefono='+57 300 000 0000',
            email='finca@example.test',
        )

    def make_product(self, name='Cafe QA', kind='Café', active='Activo', price='4.50'):
        """Crea un producto de catálogo del tipo y precio solicitados."""
        return Producto.objects.create(
            nombre=name,
            tipo_producto=kind,
            descripcion='Producto para verificar el plan.',
            precio_unitario_eur=Decimal(price),
            activo=active,
        )

    def make_client(self, vat='DE123456789'):
        """Crea un comprador europeo para escenarios de órdenes de exportación."""
        return ClienteUE.objects.create(
            razon_social='Importadora QA',
            tax_id_vat=vat,
            pais_destino='Alemania',
            puerto_destino='Hamburgo',
            direccion='Direccion de prueba',
            email_contacto='compras@example.test',
        )

    def make_lot(self, weight='5000.00', kind='Café', product=None, supplier=None):
        """Crea un lote con inventario y sus relaciones si no se proporcionaron."""
        product = product or self.make_product(kind=kind, name=f'{kind} QA {Lote.objects.count()}')
        supplier = supplier or self.make_supplier(nit=f'90012345{Lote.objects.count():02d}-1')
        return Lote.objects.create(
            tipo_producto=kind,
            producto=product,
            proveedor=supplier,
            peso_kg=Decimal(weight),
            calidad='Excelsa',
            fecha_cosecha='2026-09-01',
        )

    def order_payload(self, client, details, rate='4500.00', **extra):
        """Construye los datos comunes de una solicitud de orden de exportación."""
        return {
            'cliente': client.pk,
            'fecha_envio': '2026-11-30',
            'tasa_cambio_cop': rate,
            'detalles': details,
            **extra,
        }
