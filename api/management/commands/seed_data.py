"""Comando administrativo para cargar datos de demostración de forma idempotente."""

import os
import unicodedata
from decimal import Decimal

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from api.models import (
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


def certificate_pdf(label):
    """Genera un certificado PDF mínimo de una página para los datos de ejemplo."""
    label = unicodedata.normalize('NFKD', label).encode('ascii', 'ignore').decode('ascii')
    escaped = label.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
    stream = f'BT /F1 14 Tf 50 750 Td ({escaped}) Tj ET'.encode('ascii')
    objects = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        b'<< /Length %d >>\nstream\n' % len(stream) + stream + b'\nendstream',
    ]
    document = bytearray(b'%PDF-1.4\n')
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(document))
        document.extend(f'{index} 0 obj\n'.encode('ascii') + obj + b'\nendobj\n')
    xref_offset = len(document)
    document.extend(f'xref\n0 {len(offsets)}\n'.encode('ascii'))
    document.extend(b'0000000000 65535 f \n')
    for offset in offsets[1:]:
        document.extend(f'{offset:010d} 00000 n \n'.encode('ascii'))
    document.extend(
        f'trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\n'
        f'startxref\n{xref_offset}\n%%EOF\n'.encode('ascii')
    )
    return bytes(document)


class Command(BaseCommand):
    """Crea roles, catálogo, lotes, órdenes y eventos de trazabilidad de ejemplo."""

    help = 'Create representative users, clients, lots, certifications, and an export order.'

    @transaction.atomic
    def handle(self, *args, **options):
        """Carga datos en la base de desarrollo usando la contraseña proporcionada."""
        password = options.get('password') or os.getenv('SEED_PASSWORD')
        if not password or len(password) < 8:
            raise CommandError(
                'Provide a password of at least 8 characters with --password or SEED_PASSWORD.'
            )

        admin, _ = Usuario.objects.get_or_create(
            email='admin@ritech.com',
            defaults={
                'nombre': 'Administración Ritech',
                'rol': 'Admin',
                'is_staff': True,
                'is_superuser': True,
            },
        )
        if not admin.check_password(password):
            admin.set_password(password)
            admin.save(update_fields=['password'])

        for email, nombre, rol in (
            ('analista@ritech.com', 'Lucía Méndez', 'Analista'),
            ('calidad@ritech.com', 'Mateo Rojas', 'Calidad'),
            ('cliente@ritech.com', 'Sophie Weber', 'Cliente'),
        ):
            usuario, _ = Usuario.objects.get_or_create(
                email=email,
                defaults={'nombre': nombre, 'rol': rol, 'password': ''},
            )
            if not usuario.check_password(password):
                usuario.set_password(password)
                usuario.save(update_fields=['password'])

        proveedores = {}
        for nit, defaults in (
            ('900123456-1', {
                'razon_social': 'Cooperativa Cafetera del Huila',
                'contacto': 'Camila Torres',
                'email': 'comercio@coophuila.example',
                'telefono': '+57 608 123 4567',
                'direccion': 'Neiva, Huila, Colombia',
            }),
            ('901234567-2', {
                'razon_social': 'Asociación Cacaotera del Magdalena Medio',
                'contacto': 'Andrés Pardo',
                'email': 'exportaciones@cacaomag.example',
                'telefono': '+57 607 234 5678',
                'direccion': 'Barrancabermeja, Santander, Colombia',
            }),
        ):
            proveedores[nit], _ = Proveedor.objects.get_or_create(
                nit=nit, defaults=defaults
            )

        productos = {}
        for tipo, defaults in (
            ('Café', {
                'nombre': 'Café Excelso Colombiano',
                'descripcion': 'Café arábica colombiano de altura, seleccionado para exportación.',
                'precio_unitario_eur': Decimal('8.50'),
                'activo': 'Activo',
            }),
            ('Cacao', {
                'nombre': 'Cacao Fino de Aroma',
                'descripcion': 'Cacao fermentado y secado de origen colombiano.',
                'precio_unitario_eur': Decimal('6.80'),
                'activo': 'Activo',
            }),
        ):
            productos[tipo], _ = Producto.objects.get_or_create(
                nombre=defaults['nombre'],
                defaults={'tipo_producto': tipo, **defaults},
            )

        permiso_defaults = {
            'clientes': {
                'leer': ('Analista', 'Calidad', 'Cliente'),
                'escribir': ('Analista',),
            },
            'proveedores': {
                'leer': ('Analista', 'Calidad', 'Cliente'),
                'escribir': ('Analista', 'Calidad'),
            },
            'productos': {
                'leer': ('Analista', 'Calidad', 'Cliente'),
                'escribir': ('Analista', 'Calidad'),
            },
            'lotes': {
                'leer': ('Analista', 'Calidad', 'Cliente'),
                'escribir': ('Analista', 'Calidad'),
            },
            'certificaciones': {
                'leer': ('Analista', 'Calidad', 'Cliente'),
                'escribir': ('Calidad',),
            },
            'ordenes': {
                'leer': ('Analista', 'Calidad', 'Cliente'),
                'escribir': ('Analista',),
            },
            'dashboard': {
                'leer': ('Analista', 'Calidad', 'Cliente'),
                'escribir': (),
            },
            'trazabilidad': {
                'leer': ('Analista', 'Calidad', 'Cliente'),
                'escribir': ('Calidad',),
            },
        }
        for rol in ('Analista', 'Calidad', 'Cliente'):
            for recurso, grants in permiso_defaults.items():
                readable = rol in grants['leer']
                writable = rol in grants['escribir']
                PermisoRol.objects.get_or_create(
                    rol=rol,
                    recurso=recurso,
                    defaults={
                        'puede_leer': readable,
                        'puede_crear': writable,
                        'puede_editar': writable,
                        'puede_eliminar': writable,
                    },
                )

        clientes = {}
        for tax_id, defaults in (
            ('DE123456789', {
                'razon_social': 'Hamburg Kaffee Import GmbH',
                'pais_destino': 'Alemania',
                'direccion': 'Speicherstadt 12, Hamburg',
                'puerto_destino': 'Hamburgo',
                'email_contacto': 'compras@hamburgkaffee.example',
            }),
            ('FR12345678901', {
                'razon_social': 'Maison du Cacao SAS',
                'pais_destino': 'Francia',
                'direccion': '18 Rue du Commerce, Paris',
                'puerto_destino': 'Le Havre',
                'email_contacto': 'achats@maisondcacao.example',
            }),
            ('ESB12345678', {
                'razon_social': 'Comercio Ibérico de Café SL',
                'pais_destino': 'España',
                'direccion': 'Calle del Puerto 24, Valencia',
                'puerto_destino': 'Valencia',
                'email_contacto': 'compras@ibericocafe.example',
            }),
        ):
            cliente, _ = ClienteUE.objects.get_or_create(
                tax_id_vat=tax_id, defaults=defaults
            )
            changed_fields = []
            for field in ('puerto_destino', 'email_contacto'):
                if not getattr(cliente, field):
                    setattr(cliente, field, defaults[field])
                    changed_fields.append(field)
            if changed_fields:
                cliente.save(update_fields=changed_fields)
            clientes[tax_id] = cliente

        lotes = {}
        for codigo, defaults in (
            ('LOT-2026-CAF-001', {
                'tipo_producto': 'Café',
                'peso_kg': '1200.00',
                'calidad': 'Arábica lavado, grado especialidad',
                'fecha_cosecha': '2026-08-15',
                'estado': 'Disponible',
                'proveedor': proveedores['900123456-1'],
                'producto': productos['Café'],
            }),
            ('LOT-2026-CAF-002', {
                'tipo_producto': 'Café',
                'peso_kg': '850.00',
                'calidad': 'Arábica natural, grado exportación',
                'fecha_cosecha': '2026-09-02',
                'estado': 'Disponible',
                'proveedor': proveedores['900123456-1'],
                'producto': productos['Café'],
            }),
            ('LOT-2026-CAC-001', {
                'tipo_producto': 'Cacao',
                'peso_kg': '640.00',
                'calidad': 'Cacao fino de aroma, fermentado',
                'fecha_cosecha': '2026-07-28',
                'estado': 'Disponible',
                'proveedor': proveedores['901234567-2'],
                'producto': productos['Cacao'],
            }),
        ):
            lote, _ = Lote.objects.get_or_create(
                codigo_lote=codigo, defaults=defaults
            )
            changed_fields = []
            for field in ('proveedor', 'producto'):
                if not getattr(lote, f'{field}_id'):
                    setattr(lote, field, defaults[field])
                    changed_fields.append(field)
            if changed_fields:
                lote.save(update_fields=changed_fields)
            lotes[codigo] = lote

        for codigo, tipo in (
            ('LOT-2026-CAF-001', 'Orgánico'),
            ('LOT-2026-CAF-001', 'Fitosanitario'),
            ('LOT-2026-CAC-001', 'Fairtrade'),
        ):
            certificacion, created = Certificacion.objects.get_or_create(
                lote=lotes[codigo],
                tipo_certificado=tipo,
                defaults={'archivo_pdf': ''},
            )
            if created:
                certificacion.archivo_pdf.save(
                    f'{codigo.lower()}-{tipo.lower()}.pdf',
                    ContentFile(certificate_pdf(f'{tipo} - {codigo}')),
                    save=True,
                )

        orden, created = OrdenExportacion.objects.get_or_create(
            codigo_orden='EXP-2026-001',
            defaults={
                'cliente': clientes['DE123456789'],
                'fecha_envio': '2026-11-15',
                'valor_total_eur': '4250.00',
                'tasa_cambio_cop': '4200.00',
                'estado': 'Confirmada',
            },
        )
        if created or not orden.detalles.exists():
            lote = lotes['LOT-2026-CAF-001']
            cantidad = min(Decimal('500.00'), Decimal(lote.peso_kg))
            if cantidad <= 0:
                self.stderr.write(self.style.WARNING(
                    'No stock remains for the sample order; it was created without details.'
                ))
            else:
                OrdenLote.objects.create(
                    orden=orden,
                    lote=lote,
                    cantidad_kg=cantidad,
                    precio_unitario_eur=productos['Café'].precio_unitario_eur,
                )
                lote.peso_kg = Decimal(lote.peso_kg) - cantidad
                lote.estado = 'Reservado'
                lote.save(update_fields=['peso_kg', 'estado'])

        eventos = (
            ('Cosecha registrada', 'Cosecha selectiva de café arábica en altura.', 'Finca La Esperanza, Huila', '2026-08-15T08:00:00Z'),
            ('Control de calidad', 'Lote inspeccionado y aprobado para exportación.', 'Centro de acopio de Neiva, Huila', '2026-09-10T14:30:00Z'),
            ('Despacho', 'Documentación de exportación preparada para el envío.', 'Puerto de Cartagena, Colombia', '2026-11-15T09:00:00Z'),
        )
        for titulo, descripcion, ubicacion, fecha_evento in eventos:
            TrazabilidadEnvio.objects.get_or_create(
                orden=orden,
                titulo=titulo,
                defaults={
                    'descripcion': descripcion,
                    'ubicacion': ubicacion,
                    'fecha_evento': fecha_evento,
                },
            )

        self.stdout.write(self.style.SUCCESS(
            'Seed data is ready: 4 users, 24 role grants, 2 suppliers, 2 products, '
            '3 customers, 3 lots, 3 certificates, 1 order, 3 traceability events.'
        ))

    def add_arguments(self, parser):
        parser.add_argument(
            '--password',
            help='Password assigned to seeded users (required, or set SEED_PASSWORD).',
        )
