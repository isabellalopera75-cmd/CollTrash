# CollTrash — Guía de despliegue

Sistema de gestión de recolección de residuos sólidos. Neiva, Huila.

Este documento cubre la puesta en marcha, tanto en una máquina de desarrollo
como en un servidor. Lo que aquí se explica no es evidente leyendo el código:
son las decisiones de entorno que hacen que el sistema funcione igual fuera de
la máquina donde se escribió.

---

## 1. Qué se necesita

| Componente | Versión | Nota |
|---|---|---|
| Node.js | 20 o superior | |
| PostgreSQL | 16 o superior | con la extensión **PostGIS** |
| Una cuenta de Gmail | — | para el correo de recuperación de contraseña |

PostGIS es obligatorio: los trazados de los sectores se guardan como geometría
`LineString` y sin la extensión la base no se puede crear.

---

## 2. Base de datos

### Instalación nueva

```bash
createdb colltrash
psql -d colltrash -c "CREATE EXTENSION IF NOT EXISTS postgis;"
psql -d colltrash -f colltrash_esquema.sql
```

`colltrash_esquema.sql` ya incluye el resultado de las diecisiete migraciones
del proyecto y las marca como aplicadas, de modo que la base nace al día.

**Pero nace vacía.** Ese archivo es sólo la estructura. Un sistema sin datos no
arranca de forma útil: sin filas en `jornadas` no puede existir ninguna ruta,
sin `barrios` el portal ciudadano no puede asignar zona, sin `configuracion` no
hay teléfonos de emergencia ni punto de partida, y sin un usuario administrador
no hay por dónde entrar.

### Llevarse los datos de una instalación existente

Para trasladar un sistema que ya está en uso —lo habitual al pasar de la
máquina de desarrollo al servidor— hay que volcar estructura **y** datos:

```bash
# En el origen
pg_dump -U postgres -d colltrash --no-owner --no-privileges -f colltrash_completo.sql

# En el destino
createdb colltrash
psql -d colltrash -c "CREATE EXTENSION IF NOT EXISTS postgis;"
psql -d colltrash -f colltrash_completo.sql
```

Ese volcado lleva usuarios, rutas, asignaciones, reportes e historial. **No
lleva las fotografías de los reportes**, que viven en disco: vea la sección 6.

### Base existente que hay que actualizar

```bash
cd backend
npm run migrar:estado   # informa, no toca nada
npm run migrar          # aplica las pendientes, en orden
```

Cada migración se aplica dentro de una transacción y queda registrada en la
tabla `migraciones_aplicadas`. Si una falla, no se aplica ninguna posterior.

### Zona horaria — importante en el servidor

**Este es el error más fácil de cometer y el más difícil de detectar.**

Las veinte columnas de fecha y hora del sistema son `timestamp without time
zone` y se llenan con `NOW()`, que guarda la hora local de la sesión de
PostgreSQL. En un servidor, PostgreSQL arranca en UTC por omisión: sin este
ajuste, cada hora de inicio de ruta, cada notificación y cada reporte quedarían
**cinco horas adelantados**, y así se mostrarían en el panel.

```sql
ALTER DATABASE colltrash SET timezone = 'America/Bogota';
```

Para comprobarlo:

```sql
SHOW timezone;   -- debe decir America/Bogota
```

---

## 3. Variables de entorno

Se declaran en `backend/.env`. **Ese archivo no está versionado y no debe
estarlo**: contiene la clave de la base y el secreto de firma de las sesiones.

```bash
# Servidor
PORT=3000
NODE_ENV=production
FRONTEND_URL=https://sudominio.com

# Base de datos
DB_HOST=localhost
DB_PORT=5432
DB_NAME=colltrash
DB_USER=postgres
DB_PASSWORD=...

# Sesiones
JWT_SECRET=...
JWT_EXPIRES_IN=24h

# Correo saliente
GMAIL_USER=cuenta@gmail.com
GMAIL_PASS=...
```

### `NODE_ENV` cambia el comportamiento de CORS

Fuera de producción se admiten `localhost`, las direcciones de la red local y
los dominios de túnel tipo ngrok, para poder probar desde el teléfono. **Con
`NODE_ENV=production` sólo se admiten el mismo origen y lo que declare
`FRONTEND_URL`.**

Si sube a producción y esa variable no apunta al dominio real, el sistema
responderá a las lecturas pero rechazará todo inicio de sesión y toda operación
del conductor. El síntoma que verá el usuario es «Credenciales incorrectas»,
que no tiene nada que ver con la contraseña.

### `JWT_SECRET`

Genere uno propio para producción; no reutilice el de desarrollo:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Cambiarlo invalida todas las sesiones abiertas, que es justo lo que se quiere al
pasar a producción.

### `GMAIL_PASS` es una contraseña de aplicación

La contraseña normal de la cuenta no sirve: Google la rechaza. Hay que activar
la verificación en dos pasos y generar una contraseña de aplicación en
`myaccount.google.com/apppasswords`. Son dieciséis caracteres; escríbalos sin
espacios.

Al arrancar, el servidor informa de si puede enviar correo:

```
📧 Correo configurado. La recuperación de contraseña enviará el enlace.
⚠️  Correo NO configurado: GMAIL_USER y GMAIL_PASS están vacíos en .env.
```

**El archivo `.env` sólo se lee al arrancar el proceso.** Nodemon vigila los
`.js`, no el `.env`: después de tocarlo hay que reiniciar el backend a mano.

---

## 4. Puesta en marcha

```bash
# Backend
cd backend
npm install
npm start          # producción
npm run dev        # desarrollo, con recarga automática

# Frontend
cd frontend
npm install
npm run build      # genera frontend/build, que sirve el propio backend
npm start          # desarrollo, en el puerto 3001
```

En producción **no hay dos servidores**: el backend sirve el contenido estático
de `frontend/build` y la API bajo `/api`. Por eso el frontend no necesita saber
la dirección del backend — usa rutas relativas.

Cada vez que cambie código del cliente hay que volver a ejecutar `npm run build`
o el servidor seguirá entregando la versión anterior.

### Gestor de procesos

`nodemon` es para desarrollar. En un servidor, si el proceso se cae no vuelve
solo y un reinicio de la máquina deja el sistema apagado. Use pm2 o un servicio
de systemd:

```bash
npm install -g pm2
cd backend
pm2 start src/index.js --name colltrash
pm2 startup && pm2 save     # que sobreviva a los reinicios
```

---

## 5. HTTPS

No es opcional si quiere la detección automática de barrio: **la geolocalización
del navegador exige contexto seguro**. Sobre `http://` con la IP del servidor,
el navegador ni siquiera pide permiso y el portal cae siempre a la selección
manual de barrio.

Lo habitual es Nginx por delante con un certificado de Let's Encrypt,
redirigiendo al puerto 3000.

### El proxy tiene que dejar pasar los WebSocket

El monitoreo en vivo, los avisos del administrador y las alertas del conductor
viajan por Socket.io. Una configuración de proxy corriente **corta la conexión
de actualización a WebSocket**, y el síntoma es engañoso: el sistema parece
funcionar, pero los vehículos no se mueven en el mapa y no llega ninguna
notificación en tiempo real.

```nginx
location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;      # imprescindible
    proxy_set_header Connection "upgrade";       # imprescindible
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

`X-Forwarded-For` también importa: los limitadores de intentos de acceso cuentan
por dirección IP, y sin esa cabecera todas las peticiones parecerían venir del
propio proxy. El servidor ya está configurado con `trust proxy` para leerla.

---

## 6. Datos que persisten

| Ruta | Qué guarda |
|---|---|
| `backend/uploads/reportes/` | Fotografías de los reportes ciudadanos |

Esa carpeta **no está versionada**. Si el despliegue sustituye el directorio del
proyecto, las fotos de los reportes anteriores desaparecen y el panel del
administrador mostrará imágenes rotas. Móntela como volumen o inclúyala en la
copia de seguridad.

---

## 7. Tareas automáticas

El servidor programa por su cuenta, sin necesidad de cron del sistema:

| Cuándo | Qué hace |
|---|---|
| Domingos 23:00 | Genera las asignaciones de la semana siguiente |
| Cada 10 minutos | Marca como no asistidas las rutas del día no iniciadas a tiempo |
| Diario 02:00 | Borra el rastreo GPS de más de 48 horas |
| Diario 03:00 | Purga notificaciones de más de 2 meses y auditoría de más de un año |

Todas dependen de que el proceso esté vivo: otra razón para el gestor de
procesos.

---

## 8. Comprobación después de desplegar

```bash
cd backend && npm test          # 8 pruebas
npm run migrar:estado           # debe decir «la base de datos está al día»
```

Y en el navegador:

1. Iniciar sesión con los tres roles.
2. Crear un reporte desde el portal, con fotografía.
3. Iniciar una ruta desde el panel del conductor y verla moverse en Monitoreo.
4. Pedir un enlace de recuperación de contraseña y comprobar que llega el correo.
5. Permitir la ubicación en el portal y comprobar que detecta el barrio
   (requiere HTTPS).

Si el punto 1 falla con «Credenciales incorrectas» pero las lecturas funcionan,
revise `FRONTEND_URL`: es CORS, no la contraseña.

---

## 9. Cuentas

El sistema tiene tres roles. Sólo dos se pueden crear desde la interfaz:

- **Ciudadano** — se registra por sí mismo en el portal.
- **Conductor** — lo crea el administrador desde su panel.
- **Administrador** — no hay ninguna pantalla que lo cree. La cuenta se inserta
  directamente en la base de datos.

Para crear el primer administrador de una instalación nueva:

```bash
node -e "console.log(require('bcryptjs').hashSync('SU_CONTRASEÑA', 10))"
```

```sql
INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
VALUES ('Administrador', 'admin@sudominio.com', '<el hash generado>', 'administrador', TRUE);
```

Use un correo real: es la única vía por la que esa cuenta puede recuperar su
contraseña si se olvida.
