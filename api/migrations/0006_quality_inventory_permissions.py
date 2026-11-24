"""Amplía permisos por rol y agrega permisos para calidad e inventario."""

from django.db import migrations


def enable_quality_inventory_creation(apps, schema_editor):
    permission = apps.get_model('api', 'PermisoRol')
    for resource in ('proveedores', 'productos', 'lotes'):
        grant, _ = permission.objects.get_or_create(
            rol='Calidad',
            recurso=resource,
            defaults={
                'puede_leer': True,
                'puede_crear': True,
                'puede_editar': True,
                'puede_eliminar': True,
            },
        )
        grant.puede_crear = True
        grant.puede_editar = True
        grant.puede_eliminar = True
        grant.save(update_fields=['puede_crear', 'puede_editar', 'puede_eliminar'])


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0005_proveedor_municipio_origen'),
    ]

    operations = [
        migrations.RunPython(
            enable_quality_inventory_creation,
            migrations.RunPython.noop,
        ),
    ]
