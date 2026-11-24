"""Extensiones de autenticación JWT para los endpoints protegidos de la API."""

from rest_framework import exceptions
from rest_framework_simplejwt.authentication import JWTAuthentication


class ActiveUserJWTAuthentication(JWTAuthentication):
    """Rechaza JWT válidos cuando la cuenta asociada está desactivada."""

    def get_user(self, validated_token):
        """Obtiene el usuario del token y comprueba que la cuenta siga activa."""
        user = super().get_user(validated_token)
        if not user.is_active:
            raise exceptions.AuthenticationFailed(
                'La cuenta está inactiva.',
                code='user_inactive',
            )
        return user
