"""Serialización y validación de cuentas, inventario y exportaciones de la API."""

import re
from decimal import Decimal

from django.db import transaction
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

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


class CustomTokenSerializer(TokenObtainPairSerializer):
    """Incluye el perfil público del usuario en la respuesta de inicio de sesión JWT."""

    def validate(self, attrs):
        """Valida las credenciales e impide emitir tokens a usuarios inactivos."""
        data = super().validate(attrs)
        if not self.user.is_active:
            raise serializers.ValidationError('La cuenta está inactiva.')
        data['usuario'] = {
            'id': self.user.id,
            'nombre': self.user.nombre,
            'email': self.user.email,
            'rol': self.user.rol,
        }
        return data


class UsuarioSerializer(serializers.ModelSerializer):
    """Valida el registro público e impide que se asignen privilegios de más."""

    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = Usuario
        fields = ['id', 'nombre', 'email', 'password', 'rol']
        read_only_fields = ['id', 'rol']

    def create(self, validated_data):
        validated_data.pop('rol', None)
        return Usuario.objects.create_user(**validated_data)


class AdminUsuarioSerializer(serializers.ModelSerializer):
    """Permite a administradores gestionar roles, estado y permisos de las cuentas."""

    password = serializers.CharField(write_only=True, min_length=8, required=False)

    class Meta:
        model = Usuario
        fields = [
            'id', 'nombre', 'email', 'password', 'rol', 'is_active',
            'is_staff', 'is_superuser', 'permisos_personalizados',
        ]
        read_only_fields = ['id']

    def validate_permisos_personalizados(self, value):
        """Exige que las excepciones de permisos sean objetos JSON anidados."""
        if not isinstance(value, dict):
            raise serializers.ValidationError(
                'Los permisos personalizados deben ser un objeto JSON.'
            )
        if any(not isinstance(grants, dict) for grants in value.values()):
            raise serializers.ValidationError(
                'Cada recurso debe contener un objeto de permisos.'
            )
        return value

    def create(self, validated_data):
        """Crea un usuario administrado con la contraseña cifrada."""
        password = validated_data.pop('password')
        return Usuario.objects.create_user(password=password, **validated_data)

    def update(self, instance, validated_data):
        """Actualiza la cuenta y cifra la nueva contraseña, si se proporcionó."""
        password = validated_data.pop('password', None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class ClienteUESerializer(serializers.ModelSerializer):
    """Serializa clientes europeos y normaliza sus identificadores fiscales."""

    class Meta:
        model = ClienteUE
        fields = '__all__'

    def validate_tax_id_vat(self, value):
        """Convierte a mayúsculas y valida el identificador fiscal con prefijo de país."""
        normalized = value.upper()
        if not re.match(r'^[A-Z]{2}[A-Z0-9]{8,12}$', normalized):
            raise serializers.ValidationError(
                'Formato de Tax ID no válido (Ej: DE123456789)'
            )
        return normalized


class PermisoRolSerializer(serializers.ModelSerializer):
    """Expone los permisos CRUD de un rol para un recurso."""

    class Meta:
        model = PermisoRol
        fields = '__all__'


class ProveedorSerializer(serializers.ModelSerializer):
    """Serializa la identidad, el origen y los datos de contacto del proveedor."""

    class Meta:
        model = Proveedor
        fields = '__all__'


class ProductoSerializer(serializers.ModelSerializer):
    """Serializa productos y exige precios de referencia en EUR no negativos."""

    class Meta:
        model = Producto
        fields = '__all__'

    def validate_precio_unitario_eur(self, value):
        """Rechaza precios de referencia negativos."""
        if value < Decimal('0'):
            raise serializers.ValidationError('El precio no puede ser negativo.')
        return value


class CertificacionSerializer(serializers.ModelSerializer):
    """Valida los metadatos del certificado y el contenido de los archivos PDF."""

    MAX_PDF_SIZE = 5 * 1024 * 1024

    class Meta:
        model = Certificacion
        fields = '__all__'
        read_only_fields = ['id', 'fecha_expedicion']

    def validate_archivo_pdf(self, archivo):
        """Comprueba extensión, tamaño, tipo MIME y marcadores básicos del PDF."""
        if not archivo.name.lower().endswith('.pdf'):
            raise serializers.ValidationError('El archivo debe tener extensión .pdf.')
        if archivo.size <= 0 or archivo.size > self.MAX_PDF_SIZE:
            raise serializers.ValidationError(
                'El PDF debe tener un tamaño entre 1 byte y 5 MB.'
            )
        if archivo.content_type not in (None, '', 'application/pdf', 'application/octet-stream'):
            raise serializers.ValidationError('El tipo de archivo debe ser PDF.')

        contenido = archivo.read()
        archivo.seek(0)
        if b'%PDF-' not in contenido[:1024] or b'%%EOF' not in contenido[-1024:]:
            raise serializers.ValidationError('El archivo no contiene un PDF válido.')
        return archivo


class LoteSerializer(serializers.ModelSerializer):
    """Valida el inventario del lote y su coherencia con el producto seleccionado."""

    certificaciones = CertificacionSerializer(many=True, read_only=True)

    class Meta:
        model = Lote
        fields = '__all__'
        read_only_fields = ['id', 'codigo_lote']
        extra_kwargs = {
            'tipo_producto': {'required': False},
            'proveedor': {'required': False, 'allow_null': True},
            'producto': {'required': False, 'allow_null': True},
        }

    def validate_peso_kg(self, value):
        """Exige que el lote tenga una cantidad de inventario positiva."""
        if value <= 0:
            raise serializers.ValidationError('El peso debe ser mayor a 0 kg.')
        return value

    def validate(self, attrs):
        """Comprueba que el tipo de producto exista, coincida y esté activo."""
        producto = attrs.get('producto')
        tipo_producto = attrs.get(
            'tipo_producto',
            getattr(self.instance, 'tipo_producto', None),
        )
        if producto and 'tipo_producto' not in attrs:
            tipo_producto = producto.tipo_producto
            attrs['tipo_producto'] = tipo_producto
        if not tipo_producto:
            raise serializers.ValidationError({
                'tipo_producto': 'Indique un tipo de producto o asocie un producto.'
            })
        if producto and tipo_producto and producto.tipo_producto != tipo_producto:
            raise serializers.ValidationError({
                'producto': 'El producto debe tener el mismo tipo que el lote.'
            })
        if producto and producto.activo != 'Activo':
            raise serializers.ValidationError({
                'producto': 'No se pueden registrar lotes para un producto inactivo.'
            })
        return attrs


class OrdenLoteSerializer(serializers.ModelSerializer):
    """Serializa un detalle de orden y valida cantidad y precio unitario."""

    codigo_lote = serializers.CharField(source='lote.codigo_lote', read_only=True)
    tipo_producto = serializers.CharField(source='lote.tipo_producto', read_only=True)
    precio_unitario_eur = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal('0'),
        required=False,
    )
    subtotal_eur = serializers.DecimalField(
        max_digits=20,
        decimal_places=2,
        read_only=True,
    )

    class Meta:
        model = OrdenLote
        fields = [
            'id', 'lote', 'codigo_lote', 'tipo_producto', 'cantidad_kg',
            'precio_unitario_eur', 'subtotal_eur',
        ]
        read_only_fields = ['id']

    def validate_cantidad_kg(self, value):
        """Exige una cantidad positiva en cada detalle de la orden."""
        if value <= Decimal('0'):
            raise serializers.ValidationError('La cantidad debe ser mayor a 0 kg.')
        return value


class OrdenExportacionSerializer(serializers.ModelSerializer):
    """Valida y guarda órdenes y sus detalles de inventario de forma atómica."""

    detalles = OrdenLoteSerializer(many=True)
    cliente_nombre = serializers.CharField(source='cliente.razon_social', read_only=True)
    valor_total_cop = serializers.DecimalField(
        max_digits=24, decimal_places=2, read_only=True
    )

    class Meta:
        model = OrdenExportacion
        fields = [
            'id', 'codigo_orden', 'cliente', 'cliente_nombre', 'fecha_envio',
            'valor_total_eur', 'tasa_cambio_cop', 'valor_total_cop', 'estado',
            'detalles',
        ]
        read_only_fields = ['id', 'codigo_orden']
        extra_kwargs = {'valor_total_eur': {'required': False}}

    def validate_valor_total_eur(self, value):
        """Rechaza totales de orden negativos."""
        if value < Decimal('0'):
            raise serializers.ValidationError('El valor total no puede ser negativo.')
        return value

    def validate_tasa_cambio_cop(self, value):
        """Exige una tasa de cambio COP/EUR positiva."""
        if value <= Decimal('0'):
            raise serializers.ValidationError('La tasa de cambio debe ser mayor a cero.')
        return value

    def validate(self, attrs):
        """Valida que no se repitan detalles y calcula el total si no se indicó."""
        detalles = attrs.get('detalles')
        if detalles is not None:
            if not detalles:
                raise serializers.ValidationError(
                    {'detalles': 'Debe incluir al menos un lote en la orden.'}
                )
            lot_ids = [item['lote'].pk for item in detalles]
            if len(lot_ids) != len(set(lot_ids)):
                raise serializers.ValidationError(
                    {'detalles': 'No se puede incluir el mismo lote más de una vez.'}
                )
            if attrs.get('valor_total_eur') is None:
                total = Decimal('0.00')
                for item in detalles:
                    total += item['cantidad_kg'] * self._unit_price(
                        item['lote'],
                        item.get('precio_unitario_eur'),
                    )
                attrs['valor_total_eur'] = total.quantize(Decimal('0.01'))
        return attrs

    @staticmethod
    def _unit_price(lote, supplied_price=None):
        """Elige el precio indicado, el de referencia o el valor predeterminado."""
        if supplied_price is not None:
            return supplied_price
        if lote.producto_id:
            return lote.producto.precio_unitario_eur
        return Decimal('8.50') if lote.tipo_producto == 'Café' else Decimal('6.80')

    @staticmethod
    def _apply_details(orden, detalles_data):
        """Bloquea los lotes, reserva inventario y crea los detalles calculados."""
        for item in detalles_data:
            lote = Lote.objects.select_for_update().get(pk=item['lote'].pk)
            cantidad = item['cantidad_kg']
            if cantidad > lote.peso_kg:
                raise serializers.ValidationError(
                    f'Stock insuficiente en el lote {lote.codigo_lote}. '
                    f'Disponible: {lote.peso_kg} kg.'
                )
            if lote.estado == 'Exportado' or lote.peso_kg <= Decimal('0'):
                raise serializers.ValidationError(
                    f'El lote {lote.codigo_lote} ya no está disponible.'
                )

            OrdenLote.objects.create(
                orden=orden,
                lote=lote,
                cantidad_kg=cantidad,
                precio_unitario_eur=OrdenExportacionSerializer._unit_price(
                    lote, item.get('precio_unitario_eur')
                ),
            )
            lote.peso_kg -= cantidad
            lote.estado = 'Exportado' if lote.peso_kg == Decimal('0') else 'Reservado'
            lote.save(update_fields=['peso_kg', 'estado'])

    @transaction.atomic
    def create(self, validated_data):
        """Crea la orden y reserva todos los lotes solicitados en una transacción."""
        detalles_data = validated_data.pop('detalles')
        orden = OrdenExportacion.objects.create(**validated_data)
        self._apply_details(orden, detalles_data)
        return orden

    @transaction.atomic
    def update(self, instance, validated_data):
        """Restituye las cantidades anteriores antes de aplicar los nuevos detalles."""
        detalles_data = validated_data.pop('detalles', None)
        if detalles_data is not None:
            current_details = list(
                instance.detalles.select_related('lote').select_for_update()
            )
            for detail in current_details:
                lote = Lote.objects.select_for_update().get(pk=detail.lote_id)
                lote.peso_kg += detail.cantidad_kg
                lote.estado = 'Disponible'
                lote.save(update_fields=['peso_kg', 'estado'])
            instance.detalles.all().delete()

        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if detalles_data is not None:
            self._apply_details(instance, detalles_data)
        return instance


class TrazabilidadEnvioSerializer(serializers.ModelSerializer):
    """Serializa eventos de envío y mantiene de solo lectura los campos de pertenencia."""

    fecha = serializers.DateTimeField(
        source='fecha_evento',
        required=False,
    )

    class Meta:
        model = TrazabilidadEnvio
        fields = [
            'id', 'orden', 'titulo', 'descripcion', 'ubicacion',
            'fecha', 'fecha_evento', 'creado_por', 'creado_en',
        ]
        read_only_fields = ['id', 'orden', 'fecha_evento', 'creado_por', 'creado_en']
