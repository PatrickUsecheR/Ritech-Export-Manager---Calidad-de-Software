"""Entidades de datos y reglas de persistencia para exportaciones, inventario y trazabilidad."""

from decimal import Decimal, ROUND_HALF_UP
from uuid import uuid4

from django.db import models, transaction
from django.utils import timezone
from django.contrib.auth.models import AbstractUser, BaseUserManager

class UsuarioManager(BaseUserManager):
    """Crea cuentas usando el correo electrónico como identificador de acceso."""

    def create_user(self, email, nombre, password=None, **extra_fields):
        """Normaliza el correo y guarda la contraseña con el algoritmo de Django."""
        if not email:
            raise ValueError('El correo electrónico es obligatorio')
        email = self.normalize_email(email)
        user = self.model(email=email, nombre=nombre, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, nombre, password=None, **extra_fields):
        """Crea una cuenta administradora con privilegios de personal y superusuario."""
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('rol', 'Admin')
        return self.create_user(email, nombre, password, **extra_fields)

class Usuario(AbstractUser):
    """Usuario de la aplicación con rol comercial y permisos personalizados opcionales."""

    ROLES = [
        ('Admin', 'Administrador'),
        ('Analista', 'Analista de Exportaciones'),
        ('Calidad', 'Encargado de Calidad'),
        ('Cliente', 'Cliente UE'),
    ]
    username = None
    nombre = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    rol = models.CharField(max_length=20, choices=ROLES, default='Analista')
    permisos_personalizados = models.JSONField(default=dict, blank=True)

    objects = UsuarioManager()
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['nombre']

    class Meta:
        db_table = 'usuarios'

class ClienteUE(models.Model):
    """Comprador europeo y datos de destino asociados a órdenes de exportación."""

    razon_social = models.CharField(max_length=150)
    tax_id_vat = models.CharField(max_length=50, unique=True)
    pais_destino = models.CharField(max_length=50)
    direccion = models.CharField(max_length=200)
    puerto_destino = models.CharField(max_length=100, blank=True)
    email_contacto = models.EmailField(blank=True)

    class Meta:
        db_table = 'clientes_ue'


class Proveedor(models.Model):
    """Identidad del proveedor y su información de origen y contacto."""

    razon_social = models.CharField(max_length=150)
    nit = models.CharField(max_length=30, unique=True)
    municipio_origen = models.CharField(max_length=100, blank=True)
    contacto = models.CharField(max_length=100, blank=True)
    email = models.EmailField(blank=True)
    telefono = models.CharField(max_length=30, blank=True)
    direccion = models.CharField(max_length=200, blank=True)

    class Meta:
        db_table = 'proveedores'
        ordering = ['razon_social']

    def __str__(self):
        """Devuelve el nombre visible del proveedor."""
        return self.razon_social


class Producto(models.Model):
    """Producto del catálogo y precio de referencia para café o cacao."""

    TIPOS = [('Café', 'Café'), ('Cacao', 'Cacao')]
    ESTADOS = [('Activo', 'Activo'), ('Inactivo', 'Inactivo')]

    nombre = models.CharField(max_length=100)
    tipo_producto = models.CharField(max_length=20, choices=TIPOS)
    descripcion = models.TextField(blank=True)
    precio_unitario_eur = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal('0.00')
    )
    activo = models.CharField(max_length=10, choices=ESTADOS, default='Activo')

    class Meta:
        db_table = 'productos'
        ordering = ['nombre']

    def __str__(self):
        """Devuelve el nombre del producto del catálogo."""
        return self.nombre


class PermisoRol(models.Model):
    """Permisos CRUD de un rol para un recurso de la API."""

    ROLES = Usuario.ROLES
    ACCIONES = ('leer', 'crear', 'editar', 'eliminar')

    rol = models.CharField(max_length=20, choices=ROLES)
    recurso = models.CharField(max_length=50)
    puede_leer = models.BooleanField(default=False)
    puede_crear = models.BooleanField(default=False)
    puede_editar = models.BooleanField(default=False)
    puede_eliminar = models.BooleanField(default=False)

    class Meta:
        db_table = 'permisos_rol'
        constraints = [
            models.UniqueConstraint(
                fields=['rol', 'recurso'],
                name='permiso_rol_recurso_unico',
            ),
        ]
        ordering = ['rol', 'recurso']

    def __str__(self):
        """Devuelve una etiqueta breve de rol y recurso para vistas administrativas."""
        return f'{self.rol}: {self.recurso}'


class Lote(models.Model):
    """Lote de cosecha cuyo peso restante y estado representan el inventario exportable."""

    PRODUCTOS = [('Café', 'Café'), ('Cacao', 'Cacao')]
    ESTADOS = [
        ('Disponible', 'Disponible'),
        ('Reservado', 'Reservado'),
        ('Exportado', 'Exportado'),
    ]
    codigo_lote = models.CharField(max_length=25, unique=True, blank=True)
    tipo_producto = models.CharField(max_length=20, choices=PRODUCTOS)
    proveedor = models.ForeignKey(
        Proveedor,
        on_delete=models.PROTECT,
        related_name='lotes',
        null=True,
        blank=True,
    )
    producto = models.ForeignKey(
        Producto,
        on_delete=models.PROTECT,
        related_name='lotes',
        null=True,
        blank=True,
    )
    peso_kg = models.DecimalField(max_digits=10, decimal_places=2)
    calidad = models.CharField(max_length=50)
    fecha_cosecha = models.DateField()
    estado = models.CharField(max_length=30, choices=ESTADOS, default='Disponible')

    def save(self, *args, **kwargs):
        """Sincroniza el tipo de producto y asigna un código único al crear el lote."""
        if self.producto_id:
            self.tipo_producto = self.producto.tipo_producto
        elif self.tipo_producto:
            self.producto = Producto.objects.filter(
                tipo_producto=self.tipo_producto,
                activo='Activo',
            ).order_by('id').first()
        if not self.codigo_lote:
            prefijo = 'CAF' if self.tipo_producto == 'Café' else 'CAC'
            prefijo_codigo = f"LOT-2026-{prefijo}-"
            codigos = Lote.objects.filter(codigo_lote__startswith=prefijo_codigo).values_list('codigo_lote', flat=True)
            secuencia = 1
            existentes = set(codigos)
            while f"{prefijo_codigo}{secuencia:03d}" in existentes:
                secuencia += 1
            self.codigo_lote = f"{prefijo_codigo}{secuencia:03d}"
        super().save(*args, **kwargs)

    class Meta:
        db_table = 'lotes'
        constraints = [
            models.CheckConstraint(
                condition=models.Q(peso_kg__gte=0),
                name='lote_peso_no_negativo',
            ),
        ]

class Certificacion(models.Model):
    """Certificado PDF asociado a un lote de inventario."""

    TIPOS = [
        ('Fitosanitario', 'Fitosanitario'),
        ('Orgánico', 'Orgánico'),
        ('Fairtrade', 'Fairtrade'),
    ]
    lote = models.ForeignKey(Lote, on_delete=models.CASCADE, related_name='certificaciones')
    tipo_certificado = models.CharField(max_length=50, choices=TIPOS)
    archivo_pdf = models.FileField(upload_to='certificados/')
    fecha_expedicion = models.DateField(auto_now_add=True)

    class Meta:
        db_table = 'certificaciones'

class OrdenExportacion(models.Model):
    """Orden de exportación con destino, estado del proceso y totales en EUR/COP."""

    ESTADOS = [
        ('Borrador', 'Borrador'),
        ('Confirmada', 'Confirmada'),
        ('En tránsito', 'En tránsito'),
        ('Entregada', 'Entregada'),
    ]
    codigo_orden = models.CharField(max_length=20, unique=True, blank=True)
    cliente = models.ForeignKey(ClienteUE, on_delete=models.PROTECT, related_name='ordenes')
    fecha_envio = models.DateField()
    valor_total_eur = models.DecimalField(max_digits=12, decimal_places=2)
    tasa_cambio_cop = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal('4200.00')
    )
    valor_total_cop = models.DecimalField(
        max_digits=24, decimal_places=2, null=True, blank=True
    )
    estado = models.CharField(max_length=30, choices=ESTADOS, default='Confirmada')

    def save(self, *args, **kwargs):
        """Recalcula el total en COP y asigna un código de orden único."""
        if self.tasa_cambio_cop is not None and self.valor_total_eur is not None:
            valor_eur = Decimal(str(self.valor_total_eur))
            tasa = Decimal(str(self.tasa_cambio_cop))
            self.valor_total_cop = (valor_eur * tasa).quantize(
                Decimal('0.01'), rounding=ROUND_HALF_UP
            )
        if not self.codigo_orden and self._state.adding:
            using = kwargs.get('using')
            with transaction.atomic(using=using):
                self.codigo_orden = f'T{uuid4().hex[:15]}'
                super().save(*args, **kwargs)
                self.codigo_orden = f'EXP-2026-{self.pk:03d}'
                super().save(using=using, update_fields=['codigo_orden'])
            return
        if not self.codigo_orden:
            self.codigo_orden = f'EXP-2026-{self.pk:03d}'
        if kwargs.get('update_fields') is not None:
            kwargs['update_fields'] = set(kwargs['update_fields']) | {'valor_total_cop'}
        super().save(*args, **kwargs)

    class Meta:
        db_table = 'ordenes_exportacion'

class OrdenLote(models.Model):
    """Cantidad y precio de un lote incluido en una orden de exportación."""

    orden = models.ForeignKey(OrdenExportacion, on_delete=models.CASCADE, related_name='detalles')
    lote = models.ForeignKey(Lote, on_delete=models.PROTECT, related_name='ordenes_lote')
    cantidad_kg = models.DecimalField(max_digits=10, decimal_places=2)
    precio_unitario_eur = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal('0.00')
    )
    subtotal_eur = models.DecimalField(
        max_digits=20, decimal_places=2, default=Decimal('0.00')
    )

    def save(self, *args, **kwargs):
        """Calcula el subtotal redondeado en EUR antes de guardar el detalle."""
        self.subtotal_eur = (
            Decimal(str(self.cantidad_kg)) * Decimal(str(self.precio_unitario_eur))
        ).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP
        )
        if kwargs.get('update_fields') is not None:
            kwargs['update_fields'] = set(kwargs['update_fields']) | {'subtotal_eur'}
        super().save(*args, **kwargs)

    class Meta:
        db_table = 'ordenes_lotes'
        unique_together = ('orden', 'lote')
        constraints = [
            models.CheckConstraint(
                condition=models.Q(cantidad_kg__gt=0),
                name='orden_lote_cantidad_positiva',
            ),
        ]


class TrazabilidadEnvio(models.Model):
    """Evento cronológico de logística o calidad asociado a una orden."""

    orden = models.ForeignKey(
        OrdenExportacion,
        on_delete=models.CASCADE,
        related_name='eventos_trazabilidad',
    )
    titulo = models.CharField(max_length=100)
    descripcion = models.TextField()
    ubicacion = models.CharField(max_length=150)
    fecha_evento = models.DateTimeField(default=timezone.now)
    creado_por = models.ForeignKey(
        Usuario,
        on_delete=models.SET_NULL,
        related_name='eventos_trazabilidad',
        null=True,
        blank=True,
    )
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'trazabilidad_envios'
        ordering = ['fecha_evento', 'id']