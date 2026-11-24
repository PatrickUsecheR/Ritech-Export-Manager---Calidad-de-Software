# RiTech Export Manager

RiTech Export Manager es una aplicación web para gestionar proveedores,
productos, lotes, clientes de la Unión Europea, certificados, órdenes de
exportación y trazabilidad logística.

## Tecnologías

- Backend: Python, Django 6 y Django REST Framework.
- Autenticación: JWT con `djangorestframework-simplejwt`.
- Base de datos: PostgreSQL en ejecución normal y SQLite en memoria para las
  pruebas Django por defecto.
- Frontend: Angular 20 y TypeScript.
- Pruebas: Django TestCase/APITestCase y Playwright.

## Estructura principal

```text
ritech-export-manager/
├── api/                 # Modelos, permisos, serializadores, vistas y pruebas
├── backend/             # Configuración de Django
├── frontend/            # Aplicación Angular y pruebas E2E
├── manage.py            # Punto de entrada de Django
├── .env.example         # Variables de configuración de ejemplo
├── db.sqlite3           # Base SQLite disponible en el proyecto
└── media/               # Certificados PDF y archivos subidos
```

## Requisitos

- Python 3.12 o compatible con Django 6.
- Node.js y npm.
- PostgreSQL únicamente si se desea ejecutar la aplicación con PostgreSQL.
- Microsoft Edge o Chrome para Playwright; Chrome es suficiente para las pruebas
  unitarias del frontend.

## Instalación

Ejecute todos los comandos desde la raíz del proyecto en PowerShell.

### 1. Crear y activar el entorno virtual

```powershell
py -m venv venv
.\venv\Scripts\Activate.ps1
```

Si PowerShell bloquea la activación, habilítela para la sesión actual:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\venv\Scripts\Activate.ps1
```

### 2. Instalar las dependencias de Python

El proyecto no incluye actualmente un archivo `requirements.txt`. Instale las
dependencias utilizadas por el backend:

```powershell
python -m pip install --upgrade pip
python -m pip install django djangorestframework django-cors-headers djangorestframework-simplejwt psycopg2-binary
```

### 3. Instalar las dependencias de Angular

```powershell
cd frontend
npm install
cd ..
```

## Configuración

El backend lee las variables de entorno directamente. `.env.example` sirve como
referencia, pero no se carga automáticamente. Defina las variables en la sesión
de PowerShell antes de iniciar Django.

### Opción recomendada para desarrollo local: SQLite

```powershell
$env:DJANGO_SECRET_KEY = "clave-local-de-desarrollo"
$env:DJANGO_DEBUG = "True"
$env:DJANGO_ALLOWED_HOSTS = "localhost,127.0.0.1"
$env:CORS_ALLOWED_ORIGINS = "http://localhost:4200,http://127.0.0.1:4200"
$env:DB_ENGINE = "django.db.backends.sqlite3"
$env:DB_NAME = "db.sqlite3"
```

### Opción con PostgreSQL

```powershell
$env:DJANGO_SECRET_KEY = "replace-with-a-secure-secret"
$env:DJANGO_DEBUG = "True"
$env:DJANGO_ALLOWED_HOSTS = "localhost,127.0.0.1"
$env:CORS_ALLOWED_ORIGINS = "http://localhost:4200,http://127.0.0.1:4200"
$env:DB_ENGINE = "django.db.backends.postgresql"
$env:DB_NAME = "ritech_export_db"
$env:DB_USER = "postgres"
$env:DB_PASSWORD = "su-contrasena"
$env:DB_HOST = "localhost"
$env:DB_PORT = "5432"
```

Antes de iniciar PostgreSQL, cree una base llamada `ritech_export_db`.

## Preparar la base de datos

En la opción SQLite o PostgreSQL, aplique migraciones y cree datos de demostración:

```powershell
python manage.py migrate
python manage.py seed_data --password "Cambiar123!"
```

El comando `seed_data` es idempotente. Crea estos usuarios:

| Usuario | Rol |
|---|---|
| `admin@ritech.com` | Admin |
| `analista@ritech.com` | Analista |
| `calidad@ritech.com` | Calidad |
| `cliente@ritech.com` | Cliente |

Todos usan la contraseña indicada en `--password`. Cambie las credenciales antes
de publicar o compartir la aplicación.

## Ejecutar la aplicación

Se necesitan dos terminales de PowerShell abiertas desde la raíz del proyecto.

### Terminal 1: backend Django

```powershell
.\venv\Scripts\Activate.ps1
python manage.py runserver 127.0.0.1:8000
```

API disponible en `http://127.0.0.1:8000/api/`.
Django Admin disponible en `http://127.0.0.1:8000/admin/`.

### Terminal 2: frontend Angular

```powershell
cd frontend
npm start
```

Abra `http://127.0.0.1:4200/`.

El frontend consume `http://127.0.0.1:8000/api` según
`frontend/src/environments/environment.ts`.

## Funcionalidad disponible

- Inicio de sesión, registro y renovación de tokens JWT.
- Administración de usuarios y permisos por rol.
- CRUD de proveedores, productos, clientes, lotes y certificaciones.
- Creación y seguimiento de órdenes de exportación.
- Reserva y devolución de inventario dentro de transacciones.
- Dashboard con indicadores y exportaciones por país.
- Consulta pública de trazabilidad y registro de hitos por roles autorizados.

## API principal

Prefijo común: `/api/`.

| Ruta | Uso |
|---|---|
| `auth/register/`, `auth/login/`, `auth/refresh/` | Registro, login y renovación JWT. |
| `usuarios/`, `permisos/` | Usuarios y permisos. |
| `proveedores/`, `productos/`, `clientes/` | Catálogos comerciales. |
| `lotes/`, `certificaciones/` | Inventario y certificados PDF. |
| `ordenes/` | Órdenes de exportación y detalles. |
| `dashboard/`, `dashboard/resumen/` | Indicadores de negocio. |
| `trazabilidad/<código>/` | Consulta pública de trazabilidad. |
| `trazabilidad/<código>/eventos/` | Creación de eventos autorizados. |

## Ejecutar pruebas

### Todas las pruebas del backend

Desde la raíz:

```powershell
.\venv\Scripts\python.exe manage.py test api
```

Las pruebas Django usan SQLite en memoria por defecto, aunque `DB_ENGINE`,
`DB_NAME` y demás variables estén configuradas. El caso de concurrencia
TEST-21 requiere PostgreSQL.

Para ejecutar TEST-21 con PostgreSQL de pruebas:

```powershell
$env:DB_TEST_ENGINE = "django.db.backends.postgresql"
$env:DB_NAME = "ritech_export_db"
$env:DB_USER = "postgres"
$env:DB_PASSWORD = "su-contrasena"
$env:DB_HOST = "localhost"
$env:DB_PORT = "5432"
.\venv\Scripts\python.exe manage.py test api.test_plan.test_inventory_orders.OrderConcurrencyPlanTests.test_test_21_two_orders_cannot_reserve_more_stock_than_available
```

El nombre exacto del método debe coincidir con la prueba existente; si varía,
ejecute primero `python manage.py test api.test_plan.test_inventory_orders`.

### Pruebas unitarias del frontend

```powershell
cd frontend
npm test -- --watch=false
```

### Compilación de producción del frontend

```powershell
cd frontend
npm run build
```

El resultado se genera en `frontend/dist/frontend/`.

### Pruebas E2E con Playwright

Backend y frontend deben estar ejecutándose. Desde `frontend/`:

```powershell
npx playwright install chromium msedge
npm run test:e2e
```

Si Playwright no encuentra Edge, instale los navegadores compatibles o ejecute
la prueba Chromium configurada.

La configuración usa `http://127.0.0.1:4200` como base y contiene Chromium y
MS Edge en `frontend/playwright.config.ts`. Las pruebas E2E necesitan datos y
credenciales coherentes con la base activa.

## Arquitectura y reglas relevantes

- `api/models.py` contiene entidades, cálculos EUR/COP y restricciones de stock.
- `api/serializers.py` valida clientes, PDFs, precios, lotes y órdenes.
- `api/views.py` contiene autenticación, dashboard, CRUD y trazabilidad.
- `api/permissions.py` aplica permisos por acción y rol.
- `frontend/src/app/core/` contiene autenticación, HTTP, guardas e interceptores.
- `frontend/src/app/pages/` contiene las pantallas de la aplicación.
- Las reglas del servidor son la autoridad; el ocultamiento de botones en Angular
  no reemplaza la comprobación de permisos de la API.

## Convenciones

- Al añadir una ruta, documente su propósito, autenticación, permisos, entrada
  y respuesta.
- Al cambiar reglas de modelo o serializador, considere transacciones e inventario.
- Las pruebas deben usar datos aislados y limpiar los registros que crean.
- Los nombres de las pruebas deben indicar condición y resultado esperado.
