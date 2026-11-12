# PetCare — backend

Aplicación Django con API REST para la gestión veterinaria. Usa PostgreSQL exclusivamente y sirve el panel PetCare existente en la ruta raíz.

## Requisitos

- Python 3.12–3.14.
- PostgreSQL 15 o posterior, local o remoto.

## Instalación local

Desde la raíz del proyecto, crea y activa un entorno virtual e instala las dependencias:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Crea una base de datos y un usuario de PostgreSQL. Por ejemplo, desde `psql` como administrador:

```sql
CREATE USER petcare WITH PASSWORD 'cambia-esta-clave';
CREATE DATABASE petcare OWNER petcare;
```

Copia `.env.example` a `.env`, ajusta las credenciales de PostgreSQL y genera una clave secreta nueva:

```powershell
Copy-Item .env.example .env
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

Guarda el resultado en `DJANGO_SECRET_KEY` dentro de `.env`. El archivo `.env` está excluido de Git.

Aplica las migraciones, crea las tres cuentas iniciales de forma interactiva (los correos se muestran y las contraseñas no), y arranca el servidor:

```powershell
python manage.py migrate
python manage.py create_initial_accounts
python manage.py runserver
```

Si el panel muestra un error del servidor después de actualizar el proyecto, vuelve a ejecutar `python manage.py migrate` y recarga la página. Las migraciones actualizan el esquema de PostgreSQL, incluidas las nuevas relaciones entre citas y cuentas por cobrar.

El panel PetCare queda disponible en `http://127.0.0.1:8000/` y la API en `http://127.0.0.1:8000/api/`. Inicia sesión en el panel con las credenciales creadas en Django. La autenticación, los tutores, las mascotas, las citas, los horarios y los cobros nuevos se guardan en el backend. Al abrir la agenda, el panel intenta importar los tutores, mascotas, citas y cuentas pendientes personalizadas que quedaron guardadas anteriormente en el navegador; consulta la sección de datos locales antiguos antes de borrar los datos del navegador.

## Autenticación

El panel administrativo inicia sesión contra la API. Se requiere JWT salvo para obtener o renovar tokens:

- `POST /api/auth/token/` — recibe `email` y `password`.
- `POST /api/auth/token/refresh/` — renueva el token de acceso.
- `GET /api/auth/me/` — consulta el perfil autenticado.

Env?a el token con `Authorization: Bearer <access_token>`. La administraci?n de usuarios y los horarios son exclusivos del rol administrador. Los registros cl?nicos pueden ser creados o modificados por administradores y veterinarios. Las cuentas por cobrar est?n limitadas a administradores y recepci?n.

## Recursos principales

Los recursos CRUD usan JSON y paginación por número de página (`page`, `page_size`, máximo 100):

| Ruta | Recurso |
| --- | --- |
| `/api/users/` | Usuarios y profesionales (administrador) |
| `/api/tutors/` | Tutores |
| `/api/pets/` | Mascotas |
| `POST /api/pets/register/` | Registro atómico de tutor y primera mascota |
| `/api/appointments/` | Citas |
| `/api/appointments/veterinarians/` | Veterinarios activos disponibles para agendar |
| `/api/availability/?date=YYYY-MM-DD` | Horarios disponibles |
| `/api/schedule/` | Horarios semanales (solo administrador para editar) |
| `/api/medical-records/` | Diagnósticos, tratamientos, recetas, exámenes y vacunas |
| `/api/reminders/` | Recordatorios |
| `/api/debts/` | Cuentas por cobrar |
| `/api/payments/` | Comprobantes de pago (solo lectura) |
| `POST /api/payments/transbank/` | Inicia Webpay Plus para personal autorizado |
| `GET/POST /api/payments/transbank/return/` | Retorno de ese checkout de API |
| `/api/payments/simulate/` | Simulación local, solo disponible con `DEBUG=True` |

El registro conjunto recibe `tutor` y `pet`; reutiliza y actualiza el tutor cuando ya existe su correo. Las fotos opcionales aceptan PNG/JPG como data URI base64 hasta 5 MB. Los roles aceptados al crear usuarios son `admin`, `veterinarian` y `reception`.
El comando `python manage.py create_initial_accounts` asegura que exista un administrador y dos veterinarios activos; si ya hay cuentas, solo solicita y crea las que falten. Solicita correos y contraseñas por consola; no incluye credenciales predeterminadas. Luego el administrador puede crear cuentas de recepción desde la API.

## Webpay Plus (Transbank)

En ambiente `INTEGRATION`, el portal público `/pagar/` permite consultar las cuentas pendientes ingresando el RUT del cliente y muestra el total adeudado. La consulta requiere un RUT chileno válido, limita los intentos por IP y no muestra datos de tutores ni mascotas; se deshabilita en `PRODUCTION`. Cada cuenta pendiente puede pagarse por separado con Webpay Plus. El panel de administración PetCare (no Django Admin) permite crear, editar y eliminar cuentas pendientes, ver su estado e historial de transacciones y abrir el enlace seguro de pago. Estas funciones usan los endpoints protegidos de `/api/debts/` y `/api/payments/`; solo administradores y recepción pueden usarlos. Registra tutores y mascotas mediante `/api/tutors/` y `/api/pets/`; el RUT del tutor debe estar registrado. No se simulan cobros desde el panel.

El ambiente inicial es `INTEGRATION`; el SDK oficial utiliza las credenciales de prueba de Transbank. Al pulsar **Continuar a Webpay Plus**, Django inicia la transacción y envía el navegador al checkout seguro de Transbank. Al volver, el backend confirma la transacción y marca la deuda pagada solo si coinciden estado autorizado, monto y orden. Para probar, consulta las [tarjetas de integración y sus resultados](https://www.transbankdevelopers.cl/documentacion/como_empezar#ambientes) y la [documentación oficial de Webpay Plus](https://www.transbankdevelopers.cl/documentacion/webpay-plus). No se realizan cobros reales en este ambiente.

Desde **Citas**, el personal administrador o de recepción puede usar **Crear cobro** en una cita activa. El formulario precarga el concepto con el servicio y la fecha, solicita el monto y permite confirmar el tutor y la mascota registrados en el backend; la cuenta creada queda disponible para pagar por Webpay Plus.

El panel administrativo mantiene un acceso al portal público por RUT en `/pagar/`. Desde ahí se consultan deudas pendientes; al continuar, el checkout se abre en la página completa para redirigir de forma segura a Transbank.

La sección **Administración** del panel PetCare está disponible solo para el rol administrador; permanece oculta para veterinarios y recepción, y las URL directas a esa sección redirigen al inicio. Incluye vistas integradas de Django Admin (`/admin/`) y Swagger/OpenAPI (`/api/docs/`) dentro del mismo panel, sin abrir otra pestaña. Para Swagger, inicia sesión en el formulario integrado con la cuenta administradora; el esquema OpenAPI está disponible en `/api/schema/` y la documentación requiere una sesión autenticada como administrador. Django Admin requiere una cuenta `is_staff` con los permisos adecuados; para acceso completo debe usarse el superusuario inicial. La API conserva sus permisos y autenticación JWT.

Las citas creadas desde la agenda se guardan en PostgreSQL con mascota y veterinario existentes. Desde cada cita activa se puede crear un cobro; la cuenta queda asociada a esa cita (máximo una por cita), y la relación aparece en la agenda y en Pagos. Una cita con cobro no se puede eliminar, cancelar ni cambiar de mascota.

### Datos locales antiguos

Al iniciar sesión, la agenda reconcilia con el backend los registros personalizados pendientes de sincronización que encuentra en el almacenamiento local de ese navegador: mascotas `pet-*`, citas `apt-*` y cuentas pendientes `debt-*`. Busca tutores existentes por correo o RUT, y evita volver a crear una mascota, cita o cuenta que ya coincida con un registro del servidor. Los registros que no se puedan importar permanecen en el navegador y el panel muestra una advertencia; no borres los datos locales hasta confirmar que los datos importantes aparecen en el backend.

Las cuentas de demostración predefinidas y las cuentas que ya figuran pagadas o como pagos simulados no se convierten en cobros reales de PostgreSQL. Se conservan en el almacenamiento local original. Ese almacenamiento es independiente para cada origen: por ejemplo, `http://127.0.0.1:8000` y `http://localhost:8000` no comparten datos. Abre el panel desde el mismo host y puerto donde se guardaron los datos; si el navegador o el origen original ya no está disponible, el servidor no puede recuperar esos registros automáticamente.

Para poblar un cliente/tutor de prueba (no es una cuenta de inicio de sesión) con RUT `11.111.111-1`, una mascota y tres deudas pendientes de `$1.000`, `$15.000` y `$8.500`, ejecuta `python manage.py create_demo_payment`. El total de prueba es `$24.500`. El comando es idempotente (no duplica cuentas al repetirlo) y se bloquea fuera de `DEBUG=True` y `INTEGRATION`. Luego abre `/pagar/` y consulta ese RUT para elegir una cuenta e iniciar el checkout de prueba. Si una cuenta ya se pagó, permanece pagada; el comando no la vuelve a abrir.

El endpoint de API inicia un checkout para personal autenticado; si se utiliza, configura `TRANSBANK_RETURN_URL` con la URL HTTPS pública `/api/payments/transbank/return/`. El flujo del enlace público deriva su retorno desde `PUBLIC_BASE_URL`.

Para probar desde otra red, publica Django mediante un túnel HTTPS y configura `PUBLIC_BASE_URL` con el origen público (por ejemplo, `https://petcare.example.com`), `DJANGO_ALLOWED_HOSTS` con su host y `DJANGO_CSRF_TRUSTED_ORIGINS` con el origen HTTPS. Esa dirección debe permanecer activa durante el pago. No uses `localhost` como enlace para el teléfono: apunta al teléfono, no al computador que ejecuta Django.

Para producción, configura además `TRANSBANK_ENVIRONMENT=PRODUCTION`, `TRANSBANK_COMMERCE_CODE` y `TRANSBANK_API_KEY` con las credenciales entregadas desde el Portal de Desarrolladores. No guardes credenciales productivas en el código ni las compartas en el chat. La ruta de simulación no funciona fuera de `DEBUG=True`.

## Pruebas y comprobaciones

Con PostgreSQL ejecutándose y `.env` configurado:

```powershell
python manage.py check
python manage.py test
```

Las pruebas usan la base de datos de pruebas PostgreSQL de Django. No hay configuración ni fallback a SQLite.
El usuario configurado en `POSTGRES_USER` debe poder crear la base temporal `test_<POSTGRES_DB>` para que `manage.py test` se ejecute.

## Preparación para despliegue

La configuración lee secretos, `DEBUG`, hosts, orígenes CSRF/CORS y los parámetros PostgreSQL desde variables de entorno. WSGI, ASGI y archivos estáticos están configurados; `gunicorn config.wsgi:application` es el punto de entrada para un entorno Linux. En AWS deben configurarse una clave secreta nueva, `DEBUG=False`, hosts/orígenes explícitos y las credenciales de PostgreSQL remoto en el entorno de ejecución. Este repositorio no incluye recursos ni configuración de despliegue AWS.

Para una base PostgreSQL remota, configura `POSTGRES_SSLMODE=verify-full` y `POSTGRES_SSLROOTCERT` con la ruta del certificado CA disponible en el entorno de ejecución. Ejecuta `python manage.py collectstatic --noinput` durante la construcción de la imagen o artefacto de despliegue. HSTS se activa por una hora en producción; no se habilitan subdominios ni precarga hasta confirmar que todos los dominios del despliegue usan HTTPS.
