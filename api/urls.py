"""Definición de rutas de autenticación, recursos, indicadores y trazabilidad de la API."""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    LoginView, RegistroUsuarioView, UsuarioViewSet, PermisoRolViewSet,
    ProveedorViewSet, ProductoViewSet, ClienteUEViewSet,
    LoteViewSet, CertificacionViewSet, OrdenExportacionViewSet,
    DashboardView, TraceabilityLookupView,
)

router = DefaultRouter()
router.register(r'usuarios', UsuarioViewSet)
router.register(r'permisos', PermisoRolViewSet)
router.register(r'proveedores', ProveedorViewSet)
router.register(r'productos', ProductoViewSet)
router.register(r'clientes', ClienteUEViewSet)
router.register(r'lotes', LoteViewSet)
router.register(r'certificaciones', CertificacionViewSet)
router.register(r'ordenes', OrdenExportacionViewSet)

urlpatterns = [
    path('auth/register/', RegistroUsuarioView.as_view(), name='register'),
    path('auth/login/', LoginView.as_view(), name='login'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('dashboard/', DashboardView.as_view(), name='dashboard'),
    path('dashboard/resumen/', DashboardView.as_view(), name='dashboard-resumen'),
    path('trazabilidad/', TraceabilityLookupView.as_view(), name='trazabilidad-busqueda'),
    path(
        'trazabilidad/<str:codigo_lote>/eventos/',
        TraceabilityLookupView.as_view(),
        name='trazabilidad-eventos',
    ),
    path(
        'trazabilidad/<str:codigo_lote>/',
        TraceabilityLookupView.as_view(),
        name='trazabilidad',
    ),
    path('', include(router.urls)),
]