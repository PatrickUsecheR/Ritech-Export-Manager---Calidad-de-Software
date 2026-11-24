"""Configuración ASGI del proyecto.

Expone la aplicación ASGI mediante la variable de nivel de módulo
``application``.
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

application = get_asgi_application()
