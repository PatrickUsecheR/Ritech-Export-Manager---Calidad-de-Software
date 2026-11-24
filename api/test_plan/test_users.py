"""Escenarios del plan de QA para acceso, JWT, roles y permisos de usuario."""

import time
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from api.models import OrdenExportacion, PermisoRol, TrazabilidadEnvio, Usuario
from .support import PlanTestCase


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class UserPlanTests(PlanTestCase):
    """Verifica el ciclo de vida de cuentas, seguridad de tokens y permisos."""

    def test_test_01_password_is_hashed_and_login_returns_tokens(self):
        response = self.api.post('/api/auth/register/', {
            'nombre': 'Cuenta QA',
            'email': 'nueva-cuenta@example.test',
            'password': 'Password123!',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = Usuario.objects.get(email='nueva-cuenta@example.test')
        self.assertNotEqual(user.password, 'Password123!')
        login = self.api.post('/api/auth/login/', {
            'email': user.email,
            'password': 'Password123!',
        }, format='json')
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        self.assertIn('access', login.data)
        self.assertIn('refresh', login.data)

    def test_test_08_inactive_account_rejects_login_and_existing_token(self):
        token = str(RefreshToken.for_user(self.analista).access_token)
        self.analista.is_active = False
        self.analista.save(update_fields=['is_active'])
        login = self.api.post('/api/auth/login/', {
            'email': self.analista.email,
            'password': 'QaPass123!',
        }, format='json')
        self.assertEqual(login.status_code, status.HTTP_401_UNAUTHORIZED)
        self.api.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        protected = self.api.get('/api/lotes/')
        self.assertEqual(protected.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_test_09_client_can_read_but_cannot_create_inventory_or_orders(self):
        client = self.make_client()
        lot = self.make_lot()
        self.as_user(self.cliente_user)
        self.assertEqual(self.api.get('/api/lotes/').status_code, status.HTTP_200_OK)
        lot_create = self.api.post('/api/lotes/', {
            'tipo_producto': 'Café',
            'producto': lot.producto_id,
            'proveedor': lot.proveedor_id,
            'peso_kg': '25.00',
            'calidad': 'Excelsa',
            'fecha_cosecha': '2026-09-01',
        }, format='json')
        self.assertEqual(lot_create.status_code, status.HTTP_403_FORBIDDEN)
        order_create = self.api.post('/api/ordenes/', self.order_payload(
            client,
            [{'lote': lot.pk, 'cantidad_kg': '10.00', 'precio_unitario_eur': '4.50'}],
        ), format='json')
        self.assertEqual(order_create.status_code, status.HTTP_403_FORBIDDEN)

    def test_test_13_admin_changes_role_and_saved_user_shows_new_role(self):
        self.as_user(self.admin)
        updated = self.api.patch(
            f'/api/usuarios/{self.analista.pk}/',
            {'rol': 'Calidad'},
            format='json',
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK, updated.data)
        self.analista.refresh_from_db()
        self.assertEqual(self.analista.rol, 'Calidad')

    def test_test_14_role_matrix_controls_client_creation(self):
        PermisoRol.objects.create(
            rol='Analista',
            recurso='clientes',
            puede_leer=True,
            puede_crear=False,
            puede_editar=False,
            puede_eliminar=False,
        )
        self.as_user(self.analista)
        blocked = self.api.post('/api/clientes/', {
            'razon_social': 'Cliente bloqueado',
            'tax_id_vat': 'FR12345678901',
            'pais_destino': 'Francia',
            'direccion': 'Paris',
        }, format='json')
        self.assertEqual(blocked.status_code, status.HTTP_403_FORBIDDEN)

        self.as_user(self.admin)
        changed = self.api.patch(
            f'/api/permisos/{PermisoRol.objects.get(rol="Analista", recurso="clientes").pk}/',
            {'puede_crear': True},
            format='json',
        )
        self.assertEqual(changed.status_code, status.HTTP_200_OK)
        self.as_user(self.analista)
        allowed = self.api.post('/api/clientes/', {
            'razon_social': 'Cliente permitido',
            'tax_id_vat': 'FR12345678901',
            'pais_destino': 'Francia',
            'direccion': 'Paris',
        }, format='json')
        self.assertEqual(allowed.status_code, status.HTTP_201_CREATED, allowed.data)
        role_permissions = self.api.get('/api/permisos/mi-rol/')
        self.assertEqual(role_permissions.status_code, status.HTTP_200_OK)
        client_grant = next(
            grant for grant in role_permissions.data if grant['recurso'] == 'clientes'
        )
        self.assertTrue(client_grant['puede_crear'])

    def test_test_19_protected_api_rejects_missing_expired_and_tampered_tokens(self):
        protected_url = '/api/lotes/'
        self.api.credentials()
        self.assertEqual(self.api.get(protected_url).status_code, status.HTTP_401_UNAUTHORIZED)

        expired = AccessToken.for_user(self.analista)
        expired['exp'] = int(time.time()) - 1
        self.api.credentials(HTTP_AUTHORIZATION=f'Bearer {expired}')
        self.assertEqual(self.api.get(protected_url).status_code, status.HTTP_401_UNAUTHORIZED)

        valid = str(AccessToken.for_user(self.analista))
        tampered = f'{valid[:-1]}{"A" if valid[-1] != "A" else "B"}'
        self.api.credentials(HTTP_AUTHORIZATION=f'Bearer {tampered}')
        self.assertEqual(self.api.get(protected_url).status_code, status.HTTP_401_UNAUTHORIZED)

        order = OrdenExportacion.objects.create(
            cliente=self.make_client(),
            fecha_envio='2026-11-30',
            valor_total_eur='10.00',
            tasa_cambio_cop='4500.00',
        )
        TrazabilidadEnvio.objects.create(
            orden=order,
            titulo='Despacho',
            descripcion='Envío preparado.',
            ubicacion='Huila',
        )
        self.api.credentials()
        public = self.api.get(f'/api/trazabilidad/{order.codigo_orden}/')
        self.assertEqual(public.status_code, status.HTTP_200_OK)

    def test_test_25_quality_can_create_supplier_product_and_lot(self):
        self.as_user(self.calidad)
        supplier = self.api.post('/api/proveedores/', {
            'razon_social': 'Finca Calidad QA',
            'nit': '890123456-7',
            'municipio_origen': 'Pitalito',
        }, format='json')
        self.assertEqual(supplier.status_code, status.HTTP_201_CREATED, supplier.data)
        self.assertEqual(supplier.data['municipio_origen'], 'Pitalito')
        product = self.api.post('/api/productos/', {
            'nombre': 'Café Calidad QA',
            'tipo_producto': 'Café',
            'precio_unitario_eur': '5.00',
            'activo': 'Activo',
        }, format='json')
        self.assertEqual(product.status_code, status.HTTP_201_CREATED, product.data)
        lot = self.api.post('/api/lotes/', {
            'producto': product.data['id'],
            'proveedor': supplier.data['id'],
            'peso_kg': '100.00',
            'calidad': 'Grado exportación',
            'fecha_cosecha': '2026-09-01',
            'estado': 'Disponible',
        }, format='json')
        self.assertEqual(lot.status_code, status.HTTP_201_CREATED, lot.data)
        media = tempfile.TemporaryDirectory()
        self.addCleanup(media.cleanup)
        with override_settings(MEDIA_ROOT=media.name):
            certificate = self.api.post('/api/certificaciones/', {
                'lote': lot.data['id'],
                'tipo_certificado': 'Fitosanitario',
                'archivo_pdf': SimpleUploadedFile(
                    'certificado-calidad.pdf',
                    b'%PDF-1.4\nCertificado de prueba\n%%EOF',
                    content_type='application/pdf',
                ),
            }, format='multipart')
        self.assertEqual(certificate.status_code, status.HTTP_201_CREATED, certificate.data)
