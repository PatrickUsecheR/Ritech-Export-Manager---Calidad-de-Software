"""Configuración de los modelos de RiTech en el sitio de administración."""

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

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


@admin.register(Usuario)
class UsuarioAdmin(UserAdmin):
    """Muestra el usuario basado en correo y sus permisos por rol en Django Admin."""

    ordering = ['email']
    list_display = ['email', 'nombre', 'rol', 'is_active', 'is_staff']
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Información personal', {'fields': ('nombre', 'rol', 'permisos_personalizados')}),
        ('Permisos', {
            'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions'),
        }),
        ('Fechas', {'fields': ('last_login', 'date_joined')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'nombre', 'rol', 'password1', 'password2'),
        }),
    )
    search_fields = ['email', 'nombre']
    filter_horizontal = ['groups', 'user_permissions']


admin.site.register(ClienteUE)
admin.site.register(Proveedor)
admin.site.register(Producto)
admin.site.register(PermisoRol)
admin.site.register(Lote)
admin.site.register(Certificacion)
admin.site.register(OrdenExportacion)
admin.site.register(OrdenLote)
admin.site.register(TrazabilidadEnvio)
