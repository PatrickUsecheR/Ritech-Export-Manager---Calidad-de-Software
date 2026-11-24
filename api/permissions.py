"""Autorización por rol y recurso para las vistas de Django REST Framework."""

from rest_framework.permissions import BasePermission, SAFE_METHODS


class RolePermission(BasePermission):
    """Aplica los permisos por acción declarados en cada vista."""

    ACTIONS = {
        'list': 'puede_leer',
        'retrieve': 'puede_leer',
        'read': 'puede_leer',
        'get': 'puede_leer',
        'create': 'puede_crear',
        'post': 'puede_crear',
        'update': 'puede_editar',
        'partial_update': 'puede_editar',
        'put': 'puede_editar',
        'patch': 'puede_editar',
        'destroy': 'puede_eliminar',
        'delete': 'puede_eliminar',
    }

    def has_permission(self, request, view):
        """Determina el permiso efectivo del usuario, incluidas sus excepciones."""
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser or request.user.rol == 'Admin':
            return True

        action = getattr(view, 'action', None) or request.method.lower()
        resource = getattr(view, 'permission_resource', None)
        permission_key = self.ACTIONS.get(action)

        if resource and permission_key:
            custom = request.user.permisos_personalizados or {}
            resource_grants = custom.get(resource, {}) if isinstance(custom, dict) else {}
            if isinstance(resource_grants, dict) and permission_key in resource_grants:
                return bool(resource_grants[permission_key])

            from .models import PermisoRol

            role_grant = PermisoRol.objects.filter(
                rol=request.user.rol,
                recurso=resource,
            ).first()
            if role_grant:
                return bool(getattr(role_grant, permission_key))

        grants = getattr(view, 'role_permissions', {})
        allowed_roles = grants.get(action, ())
        if request.method in SAFE_METHODS and not allowed_roles:
            allowed_roles = grants.get('read', ())
        return request.user.rol in allowed_roles
