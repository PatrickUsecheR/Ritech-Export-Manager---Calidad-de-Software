"""Configuración WSGI del proyecto.

Expone la aplicación WSGI mediante la variable de nivel de módulo
``application``.
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

application = get_wsgi_application()
