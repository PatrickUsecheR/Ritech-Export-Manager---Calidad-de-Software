"""Endpoints HTTP para acceso, operaciones de exportación, indicadores y trazabilidad."""

from decimal import Decimal

from django.db import transaction
from django.db.models import Count, DecimalField, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

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
from .permissions import RolePermission
from .serializers import (
    AdminUsuarioSerializer,
    CertificacionSerializer,
    ClienteUESerializer,
    CustomTokenSerializer,
    LoteSerializer,
    OrdenExportacionSerializer,
    PermisoRolSerializer,
    ProductoSerializer,
    ProveedorSerializer,
    TrazabilidadEnvioSerializer,
    UsuarioSerializer,
)


class LoginView(TokenObtainPairView):
    """Emite tokens JWT e incluye el perfil del usuario autenticado."""

    permission_classes = [AllowAny]
    serializer_class = CustomTokenSerializer


class RegistroUsuarioView(generics.CreateAPIView):
    """Crea una cuenta estándar mediante el endpoint público de registro."""

    queryset = Usuario.objects.all()
    permission_classes = [AllowAny]
    serializer_class = UsuarioSerializer


class UsuarioViewSet(viewsets.ModelViewSet):
    """Ofrece operaciones CRUD de usuarios reservadas para administradores."""

    queryset = Usuario.objects.all().order_by('-id')
    permission_classes = [IsAuthenticated, RolePermission]
    serializer_class = AdminUsuarioSerializer
    permission_resource = 'usuarios'
    role_permissions = {
        'list': ('Admin',),
        'retrieve': ('Admin',),
        'create': ('Admin',),
        'update': ('Admin',),
        'partial_update': ('Admin',),
        'destroy': ('Admin',),
    }


class PermisoRolViewSet(viewsets.ModelViewSet):
    """Administra permisos por rol y expone los permisos efectivos del usuario."""

    queryset = PermisoRol.objects.all()
    serializer_class = PermisoRolSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    permission_resource = 'permisos'
    role_permissions = {
        'list': ('Admin',),
        'retrieve': ('Admin',),
        'create': ('Admin',),
        'update': ('Admin',),
        'partial_update': ('Admin',),
        'destroy': ('Admin',),
    }

    @action(
        detail=False,
        methods=['get'],
        url_path='mi-rol',
        permission_classes=[IsAuthenticated],
    )
    def mi_rol(self, request):
        """Devuelve los permisos del rol aplicando las excepciones del usuario."""
        grants = PermisoRol.objects.filter(rol=request.user.rol)
        data = PermisoRolSerializer(grants, many=True).data
        overrides = request.user.permisos_personalizados or {}
        for grant in data:
            resource_overrides = overrides.get(grant['recurso'], {})
            if isinstance(resource_overrides, dict):
                for permission in (
                    'puede_leer',
                    'puede_crear',
                    'puede_editar',
                    'puede_eliminar',
                ):
                    if permission in resource_overrides:
                        grant[permission] = bool(resource_overrides[permission])
        return Response(data)


class ProveedorViewSet(viewsets.ModelViewSet):
    """Endpoint CRUD de proveedores, protegido por permisos de rol y recurso."""

    queryset = Proveedor.objects.all()
    serializer_class = ProveedorSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    permission_resource = 'proveedores'
    role_permissions = {
        'read': ('Analista', 'Calidad', 'Cliente'),
        'create': ('Analista', 'Calidad'),
        'update': ('Analista', 'Calidad'),
        'partial_update': ('Analista', 'Calidad'),
        'destroy': ('Analista', 'Calidad'),
    }


class ProductoViewSet(viewsets.ModelViewSet):
    """Endpoint CRUD de productos del catálogo de café y cacao."""

    queryset = Producto.objects.all()
    serializer_class = ProductoSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    permission_resource = 'productos'
    role_permissions = {
        'read': ('Analista', 'Calidad', 'Cliente'),
        'create': ('Analista', 'Calidad'),
        'update': ('Analista', 'Calidad'),
        'partial_update': ('Analista', 'Calidad'),
        'destroy': ('Analista', 'Calidad'),
    }


class ClienteUEViewSet(viewsets.ModelViewSet):
    """Endpoint CRUD de compradores europeos y sus datos de destino."""

    queryset = ClienteUE.objects.all().order_by('-id')
    permission_classes = [IsAuthenticated, RolePermission]
    serializer_class = ClienteUESerializer
    permission_resource = 'clientes'
    role_permissions = {
        'read': ('Analista', 'Calidad', 'Cliente'),
        'create': ('Analista',),
        'update': ('Analista',),
        'partial_update': ('Analista',),
        'destroy': ('Analista',),
    }


class LoteViewSet(viewsets.ModelViewSet):
    """Endpoint CRUD de lotes de inventario y sus productos/certificados asociados."""

    queryset = (
        Lote.objects.select_related('proveedor', 'producto')
        .prefetch_related('certificaciones')
        .order_by('-id')
    )
    permission_classes = [IsAuthenticated, RolePermission]
    serializer_class = LoteSerializer
    permission_resource = 'lotes'
    role_permissions = {
        'read': ('Analista', 'Calidad', 'Cliente'),
        'create': ('Analista', 'Calidad'),
        'update': ('Analista', 'Calidad'),
        'partial_update': ('Analista', 'Calidad'),
        'destroy': ('Analista', 'Calidad'),
    }


class CertificacionViewSet(viewsets.ModelViewSet):
    """Endpoint CRUD de certificados PDF cargados por el personal de calidad."""

    queryset = Certificacion.objects.select_related('lote').order_by('-id')
    permission_classes = [IsAuthenticated, RolePermission]
    serializer_class = CertificacionSerializer
    parser_classes = [MultiPartParser, FormParser]
    permission_resource = 'certificaciones'
    role_permissions = {
        'read': ('Analista', 'Calidad', 'Cliente'),
        'create': ('Calidad',),
        'update': ('Calidad',),
        'partial_update': ('Calidad',),
        'destroy': ('Calidad',),
    }


class OrdenExportacionViewSet(viewsets.ModelViewSet):
    """Endpoint CRUD de órdenes, reservas de inventario e hitos iniciales de trazabilidad."""

    queryset = (
        OrdenExportacion.objects.select_related('cliente')
        .prefetch_related('detalles__lote', 'eventos_trazabilidad')
        .order_by('-id')
    )
    permission_classes = [IsAuthenticated, RolePermission]
    serializer_class = OrdenExportacionSerializer
    permission_resource = 'ordenes'
    role_permissions = {
        'read': ('Analista', 'Calidad', 'Cliente'),
        'create': ('Analista',),
        'update': ('Analista',),
        'partial_update': ('Analista',),
        'destroy': ('Analista',),
    }

    @transaction.atomic
    def perform_create(self, serializer):
        """Guarda la orden y su primer evento de trazabilidad en una transacción."""
        order = serializer.save()
        TrazabilidadEnvio.objects.create(
            orden=order,
            titulo='Orden confirmada',
            descripcion='Orden confirmada y en preparación de despacho',
            ubicacion='Origen',
            creado_por=self.request.user,
        )

    @transaction.atomic
    def perform_destroy(self, instance):
        """Restituye cada lote reservado antes de eliminar la orden."""
        for detail in instance.detalles.select_related('lote').select_for_update():
            lote = Lote.objects.select_for_update().get(pk=detail.lote_id)
            lote.peso_kg += detail.cantidad_kg
            lote.estado = 'Disponible'
            lote.save(update_fields=['peso_kg', 'estado'])
        instance.delete()


class DashboardView(APIView):
    """Resume inventario, valores exportados, órdenes recientes e indicadores por país."""

    permission_classes = [IsAuthenticated, RolePermission]
    permission_resource = 'dashboard'
    role_permissions = {'get': ('Admin', 'Analista', 'Calidad', 'Cliente')}

    def get(self, request):
        """Devuelve indicadores de exportación con valores numéricos cero por defecto."""
        decimal_field = DecimalField(max_digits=26, decimal_places=2)
        zero = Value(Decimal('0.00'), output_field=decimal_field)
        export_states = ('Confirmada', 'En tránsito', 'Entregada')
        active_states = ('Borrador', 'Confirmada', 'En tránsito')

        stock = Lote.objects.aggregate(
            peso_total_kg=Coalesce(Sum('peso_kg'), zero, output_field=decimal_field),
            peso_disponible_kg=Coalesce(
                Sum('peso_kg', filter=Q(estado='Disponible')),
                zero,
                output_field=decimal_field,
            ),
        )
        order_values = OrdenExportacion.objects.aggregate(
            suma_eur=Coalesce(
                Sum('valor_total_eur'), zero, output_field=decimal_field
            ),
            suma_cop=Coalesce(
                Sum('valor_total_cop'), zero, output_field=decimal_field
            ),
            suma_exportado_eur=Coalesce(
                Sum('valor_total_eur', filter=Q(estado__in=export_states)),
                zero,
                output_field=decimal_field,
            ),
            suma_exportado_cop=Coalesce(
                Sum('valor_total_cop', filter=Q(estado__in=export_states)),
                zero,
                output_field=decimal_field,
            ),
            total=Count('id'),
            activas=Count('id', filter=Q(estado__in=active_states)),
        )
        detail_totals = OrdenLote.objects.aggregate(
            cafe_exportado_kg=Coalesce(
                Sum(
                    'cantidad_kg',
                    filter=Q(
                        lote__tipo_producto='Café',
                        orden__estado__in=export_states,
                    ),
                ),
                zero,
                output_field=decimal_field,
            ),
            cacao_exportado_kg=Coalesce(
                Sum(
                    'cantidad_kg',
                    filter=Q(
                        lote__tipo_producto='Cacao',
                        orden__estado__in=export_states,
                    ),
                ),
                zero,
                output_field=decimal_field,
            ),
        )
        countries = list(
            OrdenExportacion.objects.filter(estado__in=export_states)
            .values('cliente__pais_destino')
            .annotate(
                ordenes=Count('id'),
                valor_total_eur=Coalesce(
                    Sum('valor_total_eur'), zero, output_field=decimal_field
                ),
                valor_total_cop=Coalesce(
                    Sum('valor_total_cop'), zero, output_field=decimal_field
                ),
            )
            .order_by('-valor_total_eur', 'cliente__pais_destino')
        )
        latest = OrdenExportacion.objects.filter(
            estado__in=export_states
        ).select_related('cliente').prefetch_related('detalles__lote').order_by(
            '-fecha_envio', '-id'
        )[:5]
        latest_exports = OrdenExportacionSerializer(latest, many=True).data
        orders_by_state = {
            row['estado']: row['cantidad']
            for row in OrdenExportacion.objects.values('estado').annotate(
                cantidad=Count('id')
            )
        }
        lots_by_state = {
            row['estado']: row['cantidad']
            for row in Lote.objects.values('estado').annotate(cantidad=Count('id'))
        }
        return Response({
            'cafe_exportado_kg': detail_totals['cafe_exportado_kg'],
            'cacao_exportado_kg': detail_totals['cacao_exportado_kg'],
            'exportado_kg': {
                'Café': detail_totals['cafe_exportado_kg'],
                'Cacao': detail_totals['cacao_exportado_kg'],
            },
            'valor_exportado_eur': order_values['suma_exportado_eur'],
            'valor_exportado_cop': order_values['suma_exportado_cop'],
            'valor_total_eur': order_values['suma_eur'],
            'valor_total_cop': order_values['suma_cop'],
            'ordenes_activas': order_values['activas'],
            'ultimas_exportaciones': latest_exports,
            'exportaciones_por_pais': [
                {
                    'pais_destino': item['cliente__pais_destino'],
                    'ordenes': item['ordenes'],
                    'valor_total_eur': item['valor_total_eur'],
                    'valor_total_cop': item['valor_total_cop'],
                }
                for item in countries
            ],
            'ordenes_por_pais': [
                {
                    'pais_destino': item['cliente__pais_destino'],
                    'ordenes': item['ordenes'],
                    'valor_total_eur': item['valor_total_eur'],
                    'valor_total_cop': item['valor_total_cop'],
                }
                for item in countries
            ],
            # Keep the original aggregate keys used by existing clients.
            'lotes': {
                'total': Lote.objects.count(),
                'por_estado': lots_by_state,
                **stock,
            },
            'ordenes': {
                'total': order_values['total'],
                'activas': order_values['activas'],
                'valor_total_eur': order_values['suma_eur'],
                'valor_total_cop': order_values['suma_cop'],
                'por_estado': orders_by_state,
            },
            'clientes_total': ClienteUE.objects.count(),
        })


class TraceabilityLookupView(APIView):
    """Permite consultar trazabilidad públicamente y registrar eventos con autorización."""

    permission_resource = 'trazabilidad'
    role_permissions = {'post': ('Admin', 'Calidad')}

    def get_permissions(self):
        """Permite consultas anónimas y autoriza escrituras según los permisos del rol."""
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsAuthenticated(), RolePermission()]

    @staticmethod
    def _event_data(orders):
        """Serializa los eventos cronológicos de las órdenes indicadas."""
        events = TrazabilidadEnvio.objects.filter(
            orden__in=orders
        ).select_related('orden', 'creado_por')
        return TrazabilidadEnvioSerializer(events, many=True).data

    def get(self, request, codigo_lote=None):
        """Busca el código de lote u orden y devuelve su registro público de trazabilidad."""
        codigo = (
            codigo_lote
            or request.query_params.get('codigo_lote')
            or request.query_params.get('codigo_orden')
            or request.query_params.get('codigo')
        )
        if not codigo:
            return Response(
                {'detail': 'Indique codigo_lote o codigo_orden.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        lote = Lote.objects.filter(codigo_lote=codigo).select_related(
            'producto', 'proveedor'
        ).first()
        if lote:
            order_ids = OrdenLote.objects.filter(lote=lote).values_list(
                'orden_id', flat=True
            )
            ordenes = OrdenExportacion.objects.filter(
                pk__in=order_ids
            ).select_related('cliente').order_by('fecha_envio', 'id')
            return Response({
                'codigo_lote': lote.codigo_lote,
                'lote': {
                    'id': lote.id,
                    'codigo_lote': lote.codigo_lote,
                    'tipo_producto': lote.tipo_producto,
                    'peso_kg': lote.peso_kg,
                    'calidad': lote.calidad,
                    'fecha_cosecha': lote.fecha_cosecha,
                    'estado': lote.estado,
                    'proveedor': lote.proveedor_id,
                    'producto': lote.producto_id,
                },
                'certificaciones': CertificacionSerializer(
                    lote.certificaciones.all(), many=True, context={'request': request}
                ).data,
                'eventos': self._event_data(ordenes),
                'ordenes': [
                    {
                        'codigo_orden': orden.codigo_orden,
                        'estado': orden.estado,
                        'fecha_envio': orden.fecha_envio,
                    }
                    for orden in ordenes
                ],
            })

        orden = OrdenExportacion.objects.filter(codigo_orden=codigo).select_related(
            'cliente'
        ).first()
        if orden:
            detalles = list(
                orden.detalles.select_related('lote', 'lote__producto').all()
            )
            lotes = [detail.lote for detail in detalles]
            return Response({
                'codigo_orden': orden.codigo_orden,
                'orden': {
                    'codigo_orden': orden.codigo_orden,
                    'estado': orden.estado,
                    'fecha_envio': orden.fecha_envio,
                    'cliente': orden.cliente.razon_social,
                    'valor_total_eur': orden.valor_total_eur,
                    'valor_total_cop': orden.valor_total_cop,
                },
                'codigo_lote': lotes[0].codigo_lote if len(lotes) == 1 else None,
                'lote': self._lot_data(lotes[0]) if len(lotes) == 1 else None,
                'lotes': [self._lot_data(lote) for lote in lotes],
                'certificaciones': CertificacionSerializer(
                    Certificacion.objects.filter(lote__in=lotes),
                    many=True,
                    context={'request': request},
                ).data,
                'eventos': self._event_data([orden]),
            })

        return Response(
            {'detail': 'No existe un lote ni una orden con ese código.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    @staticmethod
    def _lot_data(lote):
        """Construye el subconjunto de datos públicos de un lote de inventario."""
        return {
            'id': lote.id,
            'codigo_lote': lote.codigo_lote,
            'tipo_producto': lote.tipo_producto,
            'peso_kg': lote.peso_kg,
            'calidad': lote.calidad,
            'fecha_cosecha': lote.fecha_cosecha,
            'estado': lote.estado,
        }

    @transaction.atomic
    def post(self, request, codigo_lote=None):
        """Asocia un evento validado de trazabilidad a una orden vinculada al lote."""
        codigo = codigo_lote or request.query_params.get('codigo_orden')
        if not codigo:
            return Response(
                {'detail': 'Indique un código de lote o de orden.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        orden = OrdenExportacion.objects.filter(codigo_orden=codigo).first()
        if not orden:
            lote = get_object_or_404(Lote, codigo_lote=codigo)
            requested_order = request.data.get('orden')
            orders = OrdenExportacion.objects.filter(detalles__lote=lote)
            if requested_order:
                orders = orders.filter(pk=requested_order)
            orden = orders.order_by('-fecha_envio', '-id').first()
            if not orden:
                return Response(
                    {'detail': 'El lote debe estar vinculado a una orden para registrar hitos.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        serializer = TrazabilidadEnvioSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        event = serializer.save(orden=orden, creado_por=request.user)
        return Response(
            TrazabilidadEnvioSerializer(event).data,
            status=status.HTTP_201_CREATED,
        )
