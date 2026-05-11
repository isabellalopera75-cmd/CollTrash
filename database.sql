-- Script de creación de base de datos CollTrash

-- Extensión para manejar geometría (si se usa PostGIS)
CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. Tabla de usuarios (Admin y Conductores)
CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    rol VARCHAR(50) NOT NULL, -- 'admin', 'conductor'
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla de barrios (Nueva según actualización)
CREATE TABLE barrios (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    sector VARCHAR(100),
    latitud_centro DECIMAL(10,7),
    longitud_centro DECIMAL(10,7)
);

-- 3. Tabla de ciudadanos
CREATE TABLE ciudadanos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    google_id VARCHAR(255),
    foto_perfil VARCHAR(255),
    barrio_id INTEGER REFERENCES barrios(id), -- Agregado según actualización
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Vehículos
CREATE TABLE vehiculos (
    id SERIAL PRIMARY KEY,
    placa VARCHAR(20) UNIQUE NOT NULL,
    modelo VARCHAR(100),
    capacidad_ton DECIMAL(5,2),
    activo BOOLEAN DEFAULT TRUE
);

-- 5. Jornadas
CREATE TABLE jornadas (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL, -- 'mañana', 'tarde'
    hora_inicio TIME NOT NULL,
    hora_limite_fin TIME NOT NULL,
    margen_tardio_min INTEGER DEFAULT 30,
    margen_no_asistido_min INTEGER DEFAULT 60
);

-- 6. Rutas Fijas
CREATE TABLE rutas_fijas (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    jornada_id INTEGER REFERENCES jornadas(id),
    dias_semana VARCHAR(50), -- Guardado como string o array según necesidad
    conductor_default_id INTEGER REFERENCES usuarios(id),
    vehiculo_id INTEGER REFERENCES vehiculos(id),
    activo BOOLEAN DEFAULT TRUE
);

-- 7. Sectores de Ruta
CREATE TABLE sectores_ruta (
    id SERIAL PRIMARY KEY,
    ruta_fija_id INTEGER REFERENCES rutas_fijas(id),
    orden INTEGER NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    trazado_geom GEOMETRY(LineString, 4324), -- PostGIS LineString
    porcentaje_completitud_requerido INTEGER DEFAULT 90
);

-- 8. Asignaciones Semanales
CREATE TABLE asignaciones_semanales (
    id SERIAL PRIMARY KEY,
    ruta_fija_id INTEGER REFERENCES rutas_fijas(id),
    fecha DATE NOT NULL,
    conductor_id INTEGER REFERENCES usuarios(id),
    vehiculo_id INTEGER REFERENCES vehiculos(id),
    estado VARCHAR(50) DEFAULT 'pendiente', -- 'pendiente', 'activa', 'completada', 'incompleta', 'no_asistido'
    tipo_cierre VARCHAR(50), -- 'normal', 'accidente', 'otro'
    inicio_tardio BOOLEAN DEFAULT FALSE,
    hora_inicio_real TIME,
    hora_fin_real TIME
);

-- 9. Sectores por Asignación
CREATE TABLE sectores_asignacion (
    id SERIAL PRIMARY KEY,
    asignacion_id INTEGER REFERENCES asignaciones_semanales(id),
    sector_id INTEGER REFERENCES sectores_ruta(id),
    estado VARCHAR(50) DEFAULT 'pendiente', -- 'pendiente', 'en_progreso', 'completado'
    completado_at TIMESTAMP,
    porcentaje_recorrido DECIMAL(5,2) DEFAULT 0
);

-- 10. Cambios de Conductor
CREATE TABLE cambios_conductor (
    id SERIAL PRIMARY KEY,
    ruta_fija_id INTEGER REFERENCES rutas_fijas(id),
    conductor_original_id INTEGER REFERENCES usuarios(id),
    conductor_reemplazante_id INTEGER REFERENCES usuarios(id),
    motivo TEXT,
    fecha_inicio DATE,
    fecha_fin DATE,
    es_permanente BOOLEAN DEFAULT FALSE
);

-- 11. Puntos Temporales
CREATE TABLE puntos_temporales (
    id SERIAL PRIMARY KEY,
    asignacion_id INTEGER REFERENCES asignaciones_semanales(id),
    sector_id INTEGER REFERENCES sectores_ruta(id),
    latitud DECIMAL(10,7) NOT NULL,
    longitud DECIMAL(10,7) NOT NULL,
    nombre_descripcion VARCHAR(255),
    visitado BOOLEAN DEFAULT FALSE,
    motivo TEXT
);

-- 12. Rastreo GPS
CREATE TABLE rastreo_gps (
    id SERIAL PRIMARY KEY,
    asignacion_id INTEGER REFERENCES asignaciones_semanales(id),
    latitud DECIMAL(10,7) NOT NULL,
    longitud DECIMAL(10,7) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sincronizado BOOLEAN DEFAULT FALSE
);

-- 13. Descargas
CREATE TABLE descargas (
    id SERIAL PRIMARY KEY,
    asignacion_id INTEGER REFERENCES asignaciones_semanales(id),
    sector_pausa_id INTEGER,
    punto_pausa_lat DECIMAL(10,7),
    punto_pausa_lng DECIMAL(10,7),
    punto_descarga_lat DECIMAL(10,7),
    punto_descarga_lng DECIMAL(10,7),
    hora_salida TIME,
    hora_regreso TIME
);

-- 14. Incidencias Conductor
CREATE TABLE incidencias_conductor (
    id SERIAL PRIMARY KEY,
    asignacion_id INTEGER REFERENCES asignaciones_semanales(id),
    conductor_id INTEGER REFERENCES usuarios(id),
    tipo VARCHAR(50), 
    descripcion TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resuelto BOOLEAN DEFAULT FALSE,
    CONSTRAINT incidencias_conductor_tipo_check CHECK (tipo IN ('trancon', 'accidente', 'contenedor_lleno', 'via_bloqueada'))
);

-- 15. Reportes Ciudadanos
CREATE TABLE reportes_ciudadanos (
    id SERIAL PRIMARY KEY,
    ciudadano_id INTEGER REFERENCES ciudadanos(id),
    nombre_ciudadano VARCHAR(100), -- Agregado según actualización
    tipo_problema VARCHAR(100),    -- Agregado según actualización
    latitud DECIMAL(10,7) NOT NULL,
    longitud DECIMAL(10,7) NOT NULL,
    descripcion TEXT,
    foto_url VARCHAR(255),
    estado VARCHAR(50) DEFAULT 'pendiente', -- 'pendiente', 'en_proceso', 'atendido', 'rechazado'
    justificacion_rechazo TEXT, -- Agregado para el textarea del admin
    asignacion_id INTEGER REFERENCES asignaciones_semanales(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atendido_at TIMESTAMP
);

-- 16. Eficiencia de Rutas
CREATE TABLE eficiencia_rutas (
    id SERIAL PRIMARY KEY,
    asignacion_id INTEGER REFERENCES asignaciones_semanales(id),
    km_recorridos DECIMAL(10,2),
    toneladas DECIMAL(10,2),
    tiempo_minutos INTEGER,
    sectores_completados INTEGER,
    sectores_totales INTEGER,
    porcentaje_cumplimiento DECIMAL(5,2),
    num_descargas INTEGER
);
