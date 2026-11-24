"""Pruebas específicas de API y serializadores, permisos y persistencia."""

from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import serializers, status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from .models import (
    Certificacion,
    ClienteUE,
    Lote,
    OrdenExportacion,
    OrdenLote,
    PermisoRol,
    Producto,
    Proveedor,
    TrazabilidadEnvio,
    Usuario,
)
from .serializers import (
    CertificacionSerializer,
    ClienteUESerializer,
    OrdenExportacionSerializer,
    UsuarioSerializer,
)


class ClienteUESerializerTests(TestCase):
    """Verifica la normalización del VAT y los datos de contacto opcionales."""

    def test_normaliza_tax_id_vat(self):
        serializer = ClienteUESerializer(data={
            'razon_social': 'Café Europa',
            'tax_id_vat': 'de123456789',
            'pais_destino': 'Alemania',
            'direccion': 'Berlin 100',
        })

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data['tax_id_vat'], 'DE123456789')

    def test_rechaza_tax_id_vat_mal_formado(self):
        serializer = ClienteUESerializer(data={
            'razon_social': 'Cliente',
            'tax_id_vat': '123',
            'pais_destino': 'Alemania',
            'direccion': 'Berlin',
        })
        self.assertFalse(serializer.is_valid())

    def test_puerto_y_email_de_contacto_son_opcionales_y_serializables(self):
        cliente = ClienteUE.objects.create(
            razon_social='Cliente Europa',
            tax_id_vat='FR12345678901',
            pais_destino='Francia',
            direccion='Paris',
            puerto_destino='Le Havre',
            email_contacto='logistica@example.com',
        )
        response_data = ClienteUESerializer(cliente).data
        self.assertEqual(response_data['puerto_destino'], 'Le Havre')
        self.assertEqual(response_data['email_contacto'], 'logistica@example.com')


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class UsuarioSerializerTests(TestCase):
    """Verifica la seguridad del registro y el cifrado de contraseñas."""

    def test_no_permite_asignar_rol_admin_en_registro(self):
        serializer = UsuarioSerializer(data={
            'nombre': 'Usuario Prueba',
            'email': 'prueba@example.com',
            'password': 'ClaveSegura123',
            'rol': 'Admin',
        })

        self.assertTrue(serializer.is_valid(), serializer.errors)
        usuario = serializer.save()
        self.assertEqual(usuario.rol, 'Analista')
        self.assertTrue(usuario.check_password('ClaveSegura123'))


class CertificacionSerializerTests(TestCase):
    """Verifica el formato, contenido y tamaño de los certificados cargados."""

    def setUp(self):
        self.lote = Lote.objects.create(
            tipo_producto='Café',
            peso_kg=Decimal('10.00'),
            calidad='Premium',
            fecha_cosecha='2026-01-10',
        )

    def test_acepta_pdf_y_rechaza_archivo_no_pdf(self):
        pdf = SimpleUploadedFile(
            'certificado.pdf',
            b'%PDF-1.4\ncontenido\n%%EOF',
            content_type='application/pdf',
        )
        serializer = CertificacionSerializer(data={
            'lote': self.lote.id,
            'tipo_certificado': 'Orgánico',
            'archivo_pdf': pdf,
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)

        no_pdf = SimpleUploadedFile(
            'certificado.pdf', b'not a PDF', content_type='application/pdf'
        )
        invalid = CertificacionSerializer(data={
            'lote': self.lote.id,
            'tipo_certificado': 'Orgánico',
            'archivo_pdf': no_pdf,
        })
        self.assertFalse(invalid.is_valid())

    def test_rechaza_extension_no_pdf(self):
        upload = SimpleUploadedFile(
            'certificado.txt', b'%PDF-1.4\n%%EOF', content_type='application/pdf'
        )
        serializer = CertificacionSerializer(data={
            'lote': self.lote.id,
            'tipo_certificado': 'Orgánico',
            'archivo_pdf': upload,
        })
        self.assertFalse(serializer.is_valid())

    def test_limita_pdf_a_5_megabytes(self):
        upload = SimpleUploadedFile(
            'grande.pdf',
            b'%PDF-1.4\n' + (b'a' * (5 * 1024 * 1024)) + b'\n%%EOF',
            content_type='application/pdf',
        )
        serializer = CertificacionSerializer(data={
            'lote': self.lote.id,
            'tipo_certificado': 'Orgánico',
            'archivo_pdf': upload,
        })
        self.assertFalse(serializer.is_valid())
        self.assertIn('archivo_pdf', serializer.errors)


class OrdenExportacionSerializerTests(TestCase):
    """Verifica cálculos de órdenes, reserva de inventario y validación de datos."""

    def setUp(self):
        self.cliente = ClienteUE.objects.create(
            razon_social='Cliente UE',
            tax_id_vat='DE123456789',
            pais_destino='Alemania',
            direccion='Berlin 100',
        )

    def payload(self, lote, cantidad='10.00', **extra):
        data = {
            'cliente': self.cliente.id,
            'fecha_envio': '2026-02-01',
            'valor_total_eur': '100.00',
            'detalles': [{'lote': lote.id, 'cantidad_kg': cantidad}],
        }
        data.update(extra)
        return data

    def make_lote(self, peso='25.00', **extra):
        values = {
            'tipo_producto': 'Café',
            'peso_kg': Decimal(peso),
            'calidad': 'Premium',
            'fecha_cosecha': '2026-01-10',
        }
        values.update(extra)
        return Lote.objects.create(**values)

    def test_rechaza_cantidad_mayor_al_stock_sin_cambios_parciales(self):
        lote = self.make_lote('10.00')
        serializer = OrdenExportacionSerializer(data=self.payload(lote, '11.00'))

        self.assertTrue(serializer.is_valid(), serializer.errors)
        with self.assertRaises(serializers.ValidationError):
            serializer.save()

        lote.refresh_from_db()
        self.assertEqual(lote.peso_kg, Decimal('10.00'))
        self.assertEqual(OrdenExportacion.objects.count(), 0)

    def test_desconta_stock_y_marca_lote_exportado(self):
        lote = self.make_lote()
        serializer = OrdenExportacionSerializer(data=self.payload(lote, '25.00'))

        self.assertTrue(serializer.is_valid(), serializer.errors)
        orden = serializer.save()

        lote.refresh_from_db()
        self.assertEqual(lote.peso_kg, Decimal('0.00'))
        self.assertEqual(lote.estado, 'Exportado')
        self.assertEqual(orden.detalles.count(), 1)
        detalle = orden.detalles.get()
        self.assertEqual(detalle.precio_unitario_eur, Decimal('8.50'))
        self.assertEqual(detalle.subtotal_eur, Decimal('212.50'))
        self.assertEqual(orden.valor_total_cop, Decimal('420000.00'))

    def test_rechaza_lotes_duplicados_en_la_misma_orden(self):
        lote = self.make_lote()
        payload = self.payload(lote)
        payload['detalles'].append({'lote': lote.id, 'cantidad_kg': '2.00'})
        serializer = OrdenExportacionSerializer(data=payload)

        self.assertFalse(serializer.is_valid())
        self.assertIn('detalles', serializer.errors)
        self.assertEqual(OrdenExportacion.objects.count(), 0)

    def test_actualizar_orden_restituye_y_recalcula_stock(self):
        lote = self.make_lote('30.00')
        serializer = OrdenExportacionSerializer(data=self.payload(lote, '10.00'))
        self.assertTrue(serializer.is_valid(), serializer.errors)
        orden = serializer.save()

        update = OrdenExportacionSerializer(
            orden,
            data=self.payload(lote, '15.00'),
        )
        self.assertTrue(update.is_valid(), update.errors)
        update.save()

        lote.refresh_from_db()
        self.assertEqual(lote.peso_kg, Decimal('15.00'))
        self.assertEqual(orden.detalles.get().cantidad_kg, Decimal('15.00'))


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class ApiPermissionAndEndpointTests(TestCase):
    """Verifica endpoints autenticados y autorización basada en roles."""

    def setUp(self):
        self.client = APIClient()
        self.admin = Usuario.objects.create_superuser(
            email='admin@example.com',
            nombre='Admin',
            password='ClaveSegura123',
        )
        self.analista = Usuario.objects.create_user(
            email='analista@example.com',
            nombre='Analista',
            password='ClaveSegura123',
            rol='Analista',
        )
        self.calidad = Usuario.objects.create_user(
            email='calidad@example.com',
            nombre='Calidad',
            password='ClaveSegura123',
            rol='Calidad',
        )
        self.cliente = Usuario.objects.create_user(
            email='cliente@example.com',
            nombre='Cliente',
            password='ClaveSegura123',
            rol='Cliente',
        )

    def test_inactive_user_cannot_login_or_use_an_existing_jwt(self):
        token = str(RefreshToken.for_user(self.analista).access_token)
        self.analista.is_active = False
        self.analista.save(update_fields=['is_active'])

        login = self.client.post(reverse('login'), {
            'email': self.analista.email,
            'password': 'ClaveSegura123',
        })
        self.assertEqual(login.status_code, status.HTTP_401_UNAUTHORIZED)

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        response = self.client.get('/api/lotes/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_role_permissions_restrict_mutations_and_user_list(self):
        self.client.force_authenticate(self.calidad)
        self.assertEqual(self.client.get('/api/lotes/').status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.client.post('/api/lotes/', {}).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.get('/api/usuarios/').status_code,
            status.HTTP_403_FORBIDDEN,
        )

        self.client.force_authenticate(self.analista)
        response = self.client.post('/api/lotes/', {
            'tipo_producto': 'Café',
            'peso_kg': '12.50',
            'calidad': 'Premium',
            'fecha_cosecha': '2026-01-10',
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        self.client.force_authenticate(self.cliente)
        self.assertEqual(
            self.client.get('/api/ordenes/').status_code,
            status.HTTP_200_OK,
        )

        self.client.force_authenticate(self.admin)
        self.assertEqual(
            self.client.get('/api/usuarios/').status_code,
            status.HTTP_200_OK,
        )

    def test_traceability_is_public_and_dashboard_uses_decimal_zero_defaults(self):
        lote = Lote.objects.create(
            tipo_producto='Cacao',
            peso_kg=Decimal('50.00'),
            calidad='Fino de aroma',
            fecha_cosecha='2026-01-10',
        )
        public_response = self.client.get(
            reverse('trazabilidad', args=[lote.codigo_lote])
        )
        self.assertEqual(public_response.status_code, status.HTTP_200_OK)
        self.assertEqual(public_response.data['codigo_lote'], lote.codigo_lote)

        self.client.force_authenticate(self.analista)
        dashboard = self.client.get(reverse('dashboard'))
        self.assertEqual(dashboard.status_code, status.HTTP_200_OK)
        self.assertEqual(
            dashboard.data['ordenes']['valor_total_eur'],
            Decimal('0.00'),
        )
        self.assertEqual(
            dashboard.data['lotes']['peso_disponible_kg'],
            Decimal('50.00'),
        )

    def test_traceability_accepts_order_codes_and_posts_order_linked_events(self):
        cliente = ClienteUE.objects.create(
            razon_social='Importadora',
            tax_id_vat='DE123456789',
            pais_destino='Alemania',
            direccion='Hamburg',
        )
        lote = Lote.objects.create(
            tipo_producto='Café',
            peso_kg=Decimal('50.00'),
            calidad='Premium',
            fecha_cosecha='2026-08-15',
        )
        orden = OrdenExportacion.objects.create(
            cliente=cliente,
            fecha_envio='2026-11-20',
            valor_total_eur=Decimal('85.00'),
            tasa_cambio_cop=Decimal('4200.00'),
        )
        OrdenLote.objects.create(
            orden=orden,
            lote=lote,
            cantidad_kg=Decimal('10.00'),
            precio_unitario_eur=Decimal('8.50'),
        )
        self.client.force_authenticate(self.calidad)
        created = self.client.post(
            reverse('trazabilidad-eventos', args=[lote.codigo_lote]),
            {
                'titulo': 'Control de calidad',
                'fecha': '2026-11-20T12:30:00Z',
                'ubicacion': 'Neiva, Colombia',
                'descripcion': 'Inspección aprobada.',
            },
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        event = TrazabilidadEnvio.objects.get()
        self.assertEqual(event.orden_id, orden.id)

        by_order = self.client.get(reverse('trazabilidad', args=[orden.codigo_orden]))
        self.assertEqual(by_order.status_code, status.HTTP_200_OK)
        self.assertEqual(by_order.data['codigo_orden'], orden.codigo_orden)
        self.assertEqual(by_order.data['eventos'][0]['titulo'], 'Control de calidad')

        by_query = self.client.get('/api/trazabilidad/', {'codigo_orden': orden.codigo_orden})
        self.assertEqual(by_query.status_code, status.HTTP_200_OK)

    def test_dashboard_returns_export_and_country_kpis(self):
        cliente = ClienteUE.objects.create(
            razon_social='Café Import GmbH',
            tax_id_vat='DE123456789',
            pais_destino='Alemania',
            direccion='Hamburg',
        )
        lote_cafe = Lote.objects.create(
            tipo_producto='Café',
            peso_kg=Decimal('40.00'),
            calidad='Premium',
            fecha_cosecha='2026-08-15',
        )
        lote_cacao = Lote.objects.create(
            tipo_producto='Cacao',
            peso_kg=Decimal('30.00'),
            calidad='Fino',
            fecha_cosecha='2026-08-16',
        )
        orden = OrdenExportacion.objects.create(
            cliente=cliente,
            fecha_envio='2026-11-20',
            valor_total_eur=Decimal('170.00'),
            tasa_cambio_cop=Decimal('4200.00'),
            estado='Entregada',
        )
        OrdenLote.objects.create(
            orden=orden,
            lote=lote_cafe,
            cantidad_kg=Decimal('10.00'),
            precio_unitario_eur=Decimal('8.50'),
        )
        OrdenLote.objects.create(
            orden=orden,
            lote=lote_cacao,
            cantidad_kg=Decimal('10.00'),
            precio_unitario_eur=Decimal('8.50'),
        )
        self.client.force_authenticate(self.analista)
        dashboard = self.client.get(reverse('dashboard'))
        self.assertEqual(dashboard.status_code, status.HTTP_200_OK)
        self.assertEqual(dashboard.data['cafe_exportado_kg'], Decimal('10.00'))
        self.assertEqual(dashboard.data['cacao_exportado_kg'], Decimal('10.00'))
        self.assertEqual(dashboard.data['valor_exportado_eur'], Decimal('170.00'))
        self.assertEqual(dashboard.data['valor_exportado_cop'], Decimal('714000.00'))
        self.assertEqual(dashboard.data['ordenes_activas'], 0)
        self.assertEqual(dashboard.data['ultimas_exportaciones'][0]['id'], orden.id)
        self.assertEqual(
            dashboard.data['exportaciones_por_pais'][0]['pais_destino'],
            'Alemania',
        )

    def test_analyst_can_create_supplier_and_product_and_roles_can_be_overridden(self):
        self.client.force_authenticate(self.analista)
        supplier = self.client.post('/api/proveedores/', {
            'razon_social': 'Cooperativa Andina',
            'nit': '900123456-1',
            'contacto': 'Ana Ruiz',
            'email': 'ana@example.com',
            'telefono': '+57 300 123 4567',
            'direccion': 'Huila, Colombia',
        })
        self.assertEqual(supplier.status_code, status.HTTP_201_CREATED, supplier.data)
        product = self.client.post('/api/productos/', {
            'nombre': 'Café de altura',
            'tipo_producto': 'Café',
            'descripcion': 'Arábica colombiano.',
            'precio_unitario_eur': '8.50',
            'activo': 'Activo',
        })
        self.assertEqual(product.status_code, status.HTTP_201_CREATED, product.data)
        self.assertEqual(Proveedor.objects.count(), 1)
        self.assertEqual(Producto.objects.count(), 1)

        PermisoRol.objects.create(
            rol='Analista',
            recurso='productos',
            puede_leer=False,
            puede_crear=False,
            puede_editar=False,
            puede_eliminar=False,
        )
        self.assertEqual(self.client.get('/api/productos/').status_code, status.HTTP_403_FORBIDDEN)
        self.analista.permisos_personalizados = {
            'productos': {'puede_leer': True},
        }
        self.analista.save(update_fields=['permisos_personalizados'])
        self.assertEqual(self.client.get('/api/productos/').status_code, status.HTTP_200_OK)

        self.client.force_authenticate(self.admin)
        permission = self.client.post('/api/permisos/', {
            'rol': 'Cliente',
            'recurso': 'productos',
            'puede_leer': True,
            'puede_crear': False,
            'puede_editar': False,
            'puede_eliminar': False,
        })
        self.assertEqual(permission.status_code, status.HTTP_201_CREATED, permission.data)
        user = self.client.post('/api/usuarios/', {
            'nombre': 'Operador nuevo',
            'email': 'operador@example.com',
            'password': 'ClaveSegura123',
            'rol': 'Calidad',
            'permisos_personalizados': {'productos': {'puede_leer': True}},
        }, format='json')
        self.assertEqual(user.status_code, status.HTTP_201_CREATED, user.data)
        self.assertEqual(
            user.data['permisos_personalizados'],
            {'productos': {'puede_leer': True}},
        )

    def test_certification_crud_requires_quality_role_and_pdf(self):
        lote = Lote.objects.create(
            tipo_producto='Café',
            peso_kg=Decimal('10.00'),
            calidad='Premium',
            fecha_cosecha='2026-01-10',
        )
        self.client.force_authenticate(self.analista)
        forbidden = self.client.post('/api/certificaciones/', {
            'lote': lote.id,
            'tipo_certificado': 'Orgánico',
        })
        self.assertEqual(forbidden.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.calidad)
        invalid = self.client.post('/api/certificaciones/', {
            'lote': lote.id,
            'tipo_certificado': 'Orgánico',
            'archivo_pdf': SimpleUploadedFile(
                'nota.txt', b'not pdf', content_type='text/plain'
            ),
        }, format='multipart')
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Certificacion.objects.count(), 0)
