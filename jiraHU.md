**HISTORIAS DE USUARIO**

**CollTrash**

Sistema de Gestión de Rutas de Recolección de Residuos Sólidos

Competencia SENA 220501094

Versión 2.0 --- 2026

**Descripción del Proyecto**

CollTrash es una aplicación web y móvil para gestionar las rutas de
recolección de residuos sólidos en Neiva, Huila. El sistema tiene tres
tipos de usuarios: administradores, conductores y ciudadanos.

**Resumen del Backlog**

  ------------ -------------------------- --------------- ------------ ------------
  **Sprint**   **Tema**                   **Historias**   **Puntos**   **Estado**

  Sprint 1     Base, autenticación y      GRS-01 al 07    39           ✅ Done
               rutas                                                   

  Sprint 2     GPS, jornadas y conductor  GRS-08 al 16    57           ✅ Done

  Sprint 3     Reportes y dashboard       GRS-17 al 22    34           ✅ Done

  Sprint 4     Dashboard mensual y        GRS-23 al 29    34           ✅ Done
               optimización BD                                         

  **TOTAL**                               **29            **164**      
                                          historias**                  
  ------------ -------------------------- --------------- ------------ ------------

**SPRINT 1 --- Base, Autenticación y Rutas**

Objetivo: configurar el sistema base, la autenticación de usuarios y la
creación de rutas fijas con trazado en mapa.

+---------------+------------------------------------------------------+
| **Historia de | **GRS-01 --- Configuración inicial del proyecto**    |
| Usuario**     |                                                      |
+---------------+------------------------------------------------------+
| **Como:**     | desarrollador                                        |
+---------------+------------------------------------------------------+
| **Quiero:**   | configurar la base de datos PostgreSQL con PostGIS,  |
|               | el backend en Node.js y el repositorio en GitHub     |
+---------------+------------------------------------------------------+
| **Para que:** | el equipo tenga una base sólida para empezar a       |
|               | desarrollar                                          |
+---------------+------------------------------------------------------+
| **Criterios   | - La base de datos corre en PostgreSQL 18 con        |
| de            |   PostGIS activado                                   |
| aceptación:** |                                                      |
|               | - Las 18 tablas del sistema están creadas            |
|               |   correctamente                                      |
|               |                                                      |
|               | - El backend tiene la estructura de carpetas         |
|               |   organizada (controllers, routes, services,         |
|               |   migrations)                                        |
|               |                                                      |
|               | - El repositorio está en GitHub con README de        |
|               |   instalación                                        |
|               |                                                      |
|               | - ESLint y Jest están configurados                   |
+---------------+------------------------------------------------------+
| **Sprint:**   | Sprint 1 --- Puntos de historia: 3                   |
+---------------+------------------------------------------------------+

+---------------+------------------------------------------------------+
| **Historia de | **GRS-02 --- Inicio de sesión para administrador y   |
| Usuario**     | conductor**                                          |
+---------------+------------------------------------------------------+
| **Como:**     | administrador o conductor                            |
+---------------+------------------------------------------------------+
| **Quiero:**   | iniciar sesión con mi email y contraseña             |
+---------------+------------------------------------------------------+
| **Para que:** | pueda entrar al sistema de forma segura según mi rol |
+---------------+------------------------------------------------------+
| **Criterios   | - El formulario tiene campos de email y contraseña   |
| de            |                                                      |
| aceptación:** | - Si las credenciales son incorrectas muestra un     |
|               |   mensaje de error                                   |
|               |                                                      |
|               | - Al iniciar sesión correctamente genera un token    |
|               |   JWT de 8 horas                                     |
|               |                                                      |
|               | - El administrador va al dashboard web y el          |
|               |   conductor al panel móvil                           |
|               |                                                      |
|               | - Las contraseñas se guardan cifradas con bcrypt     |
+---------------+------------------------------------------------------+
| **Sprint:**   | Sprint 1 --- Puntos de historia: 3                   |
+---------------+------------------------------------------------------+

+---------------+------------------------------------------------------+
| **Historia de | **GRS-03 --- Registro e inicio de sesión del         |
| Usuario**     | ciudadano**                                          |
+---------------+------------------------------------------------------+
| **Como:**     | ciudadano                                            |
+---------------+------------------------------------------------------+
| **Quiero:**   | registrarme con mi correo electrónico o con Google   |
|               | para acceder al portal                               |
+---------------+------------------------------------------------------+
| **Para que:** | pueda enviar reportes y ver mi historial             |
+---------------+------------------------------------------------------+
| **Criterios   | - El portal tiene opción de registrarse con          |
| de            |   email/contraseña o con Google                      |
| aceptación:** |                                                      |
|               | - Al registrarse crea el usuario en la base de datos |
|               |                                                      |
|               | - Después de autenticarse el ciudadano ve el portal  |
|               |   principal                                          |
|               |                                                      |
|               | - No se guardan contraseñas en texto plano           |
+---------------+------------------------------------------------------+
| **Sprint:**   | Sprint 1 --- Puntos de historia: 3                   |
+---------------+------------------------------------------------------+

+---------------+------------------------------------------------------+
| **Historia de | **GRS-04 --- Registrar conductores**                 |
| Usuario**     |                                                      |
+---------------+------------------------------------------------------+
| **Como:**     | administrador                                        |
+---------------+------------------------------------------------------+
| **Quiero:**   | registrar un conductor ingresando su nombre, cédula, |
|               | teléfono, email y contraseña                         |
+---------------+------------------------------------------------------+
| **Para que:** | el conductor pueda acceder a la app móvil            |
+---------------+------------------------------------------------------+
| **Criterios   | - El formulario valida que todos los campos          |
| de            |   obligatorios estén llenos                          |
| aceptación:** |                                                      |
|               | - El email, cédula y teléfono no pueden estar        |
|               |   duplicados                                         |
|               |                                                      |
|               | - La contraseña se cifra antes de guardarla          |
|               |                                                      |
|               | - El conductor puede iniciar sesión inmediatamente   |
+---------------+------------------------------------------------------+
| **Sprint:**   | Sprint 1 --- Puntos de historia: 3                   |
+---------------+------------------------------------------------------+

+---------------+------------------------------------------------------+
| **Historia de | **GRS-05 --- Crear ruta fija con repetición          |
| Usuario**     | semanal**                                            |
+---------------+------------------------------------------------------+
| **Como:**     | administrador                                        |
+---------------+------------------------------------------------------+
| **Quiero:**   | crear una ruta asignando nombre, jornada, días de la |
|               | semana, conductor y vehículo                         |
+---------------+------------------------------------------------------+
| **Para que:** | la ruta se genere automáticamente cada semana sin    |
|               | crearla desde cero                                   |
+---------------+------------------------------------------------------+
| **Criterios   | - El formulario tiene campos de nombre, jornada,     |
| de            |   días (L,M,X,J,V,S), conductor y vehículo           |
| aceptación:** |                                                      |
|               | - Los días se guardan como números en la base de     |
|               |   datos (1=lunes\...7=domingo)                       |
|               |                                                      |
|               | - El sistema avisa si el conductor ya tiene otra     |
|               |   ruta en ese horario                                |
|               |                                                      |
|               | - Al guardar se generan automáticamente las          |
|               |   asignaciones de la semana actual                   |
+---------------+------------------------------------------------------+
| **Sprint:**   | Sprint 1 --- Puntos de historia: 8                   |
+---------------+------------------------------------------------------+

+---------------+------------------------------------------------------+
| **Historia de | **GRS-06 --- Trazar la ruta en el mapa**             |
| Usuario**     |                                                      |
+---------------+------------------------------------------------------+
| **Como:**     | administrador                                        |
+---------------+------------------------------------------------------+
| **Quiero:**   | dibujar el recorrido exacto de la ruta en el mapa    |
|               | dividiéndolo en sectores                             |
+---------------+------------------------------------------------------+
| **Para que:** | el conductor sepa exactamente por dónde pasar        |
+---------------+------------------------------------------------------+
| **Criterios   | - El mapa carga sobre OpenStreetMap                  |
| de            |                                                      |
| aceptación:** | - El admin puede dibujar el trazado calle por calle  |
|               |                                                      |
|               | - El trazado se divide en sectores con nombre y      |
|               |   orden                                              |
|               |                                                      |
|               | - La geometría se guarda automáticamente en formato  |
|               |   PostGIS                                            |
+---------------+------------------------------------------------------+
| **Sprint:**   | Sprint 1 --- Puntos de historia: 8                   |
+---------------+------------------------------------------------------+

+---------------+------------------------------------------------------+
| **Historia de | **GRS-07 --- Generación automática de asignaciones   |
| Usuario**     | semanales**                                          |
+---------------+------------------------------------------------------+
| **Como:**     | sistema                                              |
+---------------+------------------------------------------------------+
| **Quiero:**   | crear automáticamente las asignaciones de la semana  |
|               | siguiente todos los domingos a las 11pm              |
+---------------+------------------------------------------------------+
| **Para que:** | el admin no tenga que crear las rutas manualmente    |
|               | cada semana                                          |
+---------------+------------------------------------------------------+
| **Criterios   | - El cron job se ejecuta todos los domingos a las    |
| de            |   11:00pm                                            |
| aceptación:** |                                                      |
|               | - Genera una asignación por cada ruta activa según   |
|               |   sus días de operación                              |
|               |                                                      |
|               | - Las asignaciones quedan en estado pendiente        |
|               |                                                      |
|               | - Al crear cada asignación se copian automáticamente |
|               |   los sectores                                       |
+---------------+------------------------------------------------------+
| **Sprint:**   | Sprint 1 --- Puntos de historia: 5                   |
+---------------+------------------------------------------------------+

**SPRINT 2 --- GPS, Jornadas y Panel del Conductor**

Objetivo: implementar el panel del conductor con GPS, control de
jornadas, incidencias y modo offline.

+---------------+------------------------------------------------------+
| **Historia de | **GRS-08 --- Conductor ve su asignación del día**    |
| Usuario**     |                                                      |
+---------------+------------------------------------------------------+
| **Como:**     | conductor                                            |
+---------------+------------------------------------------------------+
| **Quiero:**   | ver en mi celular la ruta que tengo asignada para    |
|               | hoy con todos los detalles                           |
+---------------+------------------------------------------------------+
| **Para que:** | sepa qué ruta tengo y pueda iniciar mi recorrido     |
+---------------+------------------------------------------------------+
| **Criterios   | - La app muestra la asignación del día al entrar     |
| de            |                                                      |
| aceptación:** | - Muestra nombre de la ruta, vehículo, jornada y     |
|               |   horario                                            |
|               |                                                      |
|               | - Si la ruta es de otro día avisa con la fecha       |
|               |   programada                                         |
|               |                                                      |
|               | - Si no hay ruta asignada muestra un mensaje         |
|               |   informativo                                        |
+---------------+------------------------------------------------------+
| **Sprint:**   | Sprint 2 --- Puntos de historia: 5                   |
+---------------+------------------------------------------------------+

+---------------+------------------------------------------------------+
| **Historia de | **GRS-09 --- Control de inicio tardío**              |
| Usuario**     |                                                      |
+---------------+------------------------------------------------------+
| **Como:**     | sistema                                              |
+---------------+------------------------------------------------------+
| **Quiero:**   | detectar cuando un conductor inicia entre 30 y 60    |
|               | minutos después del horario                          |
+---------------+------------------------------------------------------+
| **Para que:** | el administrador sea notificado del retraso          |
+---------------+------------------------------------------------------+
| **Criterios   | - Si inicia entre 30 y 60 minutos tarde se pide una  |
| de            |   justificación                                      |
| aceptación:** |                                                      |
|               | - La asignación queda marcada como inicio tardío     |
|               |                                                      |
|               | - El admin recibe una notificación de alerta         |
+---------------+------------------------------------------------------+
| **Sprint:**   | Sprint 2 --- Puntos de historia: 5                   |
+---------------+------------------------------------------------------+

+---------------+------------------------------------------------------+
| **Historia de | **GRS-10 --- Control de no asistido**                |
| Usuario**     |                                                      |
+---------------+------------------------------------------------------+
| **Como:**     | sistema                                              |
+---------------+------------------------------------------------------+
| **Quiero:**   | detectar cuando un conductor no inicia su ruta       |
|               | después de 60 minutos                                |
+---------------+------------------------------------------------------+
| **Para que:** | el admin pueda tomar una decisión a tiempo           |
+---------------+------------------------------------------------------+
| **Criterios   | - Si pasan 60 minutos sin iniciar, el botón se       |
| de            |   bloquea                                            |
| aceptación:** |                                                      |
|               | - El admin recibe una notificación                   |
|               |                                                      |
|               | - El admin puede habilitar el inicio manualmente con |
|               |   una justificación                                  |
+---------------+------------------------------------------------------+
| **Sprint:**   | Sprint 2 --- Puntos de historia: 5                   |
+---------------+------------------------------------------------------+

+---------------+------------------------------------------------------+
| **Historia de | **GRS-11 --- Mapa con trazado de la ruta**           |
| Usuario**     |                                                      |
+---------------+------------------------------------------------------+
| **Como:**     | conductor                                            |
+---------------+------------------------------------------------------+
| **Quiero:**   | ver el trazado de mi ruta en el mapa con los         |
|               | sectores y mi posición actual                        |
+---------------+------------------------------------------------------+
| **Para que:** | sepa exactamente por dónde ir                        |
+---------------+------------------------------------------------------+
| **Criterios   | - El mapa muestra el trazado completo de todos los   |
| de            |   sectores                                           |
| aceptación:** |                                                      |
|               | - La posición del conductor se actualiza en tiempo   |
|               |   real                                               |
|               |                                                      |
|               | - Los sectores completados se ven en verde           |
|               |                                                      |
|               | - Los reportes ciudadanos aparecen como pines rojos  |
+---------------+------------------------------------------------------+
| **Sprint:**   | Sprint 2 --- Puntos de historia: 8                   |
+---------------+------------------------------------------------------+

+---------------+------------------------------------------------------+
| **Historia de | **GRS-12 --- Registrar descarga de basura**          |
| Usuario**     |                                                      |
+---------------+------------------------------------------------------+
| **Como:**     | conductor                                            |
+---------------+------------------------------------------------------+
| **Quiero:**   | registrar cuando voy a descargar la basura en el     |
|               | botadero                                             |
+---------------+------------------------------------------------------+
| **Para que:** | quede un registro de las descargas de la jornada     |
+---------------+------------------------------------------------------+
| **Criterios   | - La app permite registrar la parada de descarga     |
| de            |                                                      |
| aceptación:** | - Guarda la ubicación GPS y el sector donde se hizo  |
|               |   la pausa                                           |
|               |                                                      |
|               | - Al regresar el conductor puede marcar la hora de   |
|               |   regreso                                            |
+---------------+------------------------------------------------------+
| **Sprint:**   | Sprint 2 --- Puntos de historia: 5                   |
+---------------+------------------------------------------------------+

+---------------+------------------------------------------------------+
| **Historia de | **GRS-13 --- Monitoreo GPS en tiempo real**          |
| Usuario**     |                                                      |
+---------------+------------------------------------------------------+
| **Como:**     | administrador                                        |
+---------------+------------------------------------------------------+
| **Quiero:**   | ver en el mapa la posición de todos los camiones     |
|               | activos en tiempo real                               |
+---------------+------------------------------------------------------+
| **Para que:** | pueda supervisar la operación desde la oficina       |
+---------------+------------------------------------------------------+
| **Criterios   | - El mapa muestra los camiones moviéndose en vivo    |
| de            |                                                      |
| aceptación:** | - Se actualiza automáticamente mediante WebSockets   |
|               |                                                      |
|               | - Al hacer clic en un camión se ve el nombre del     |
|               |   conductor y el progreso                            |
+---------------+------------------------------------------------------+
| **Sprint:**   | Sprint 2 --- Puntos de historia: 8                   |
+---------------+------------------------------------------------------+

+---------------+------------------------------------------------------+
| **Historia de | **GRS-14 --- Reportar novedad en la ruta**           |
| Usuario**     |                                                      |
+---------------+------------------------------------------------------+
| **Como:**     | conductor                                            |
+---------------+------------------------------------------------------+
| **Quiero:**   | enviar un reporte al admin cuando ocurre un problema |
|               | en la vía                                            |
+---------------+------------------------------------------------------+
| **Para que:** | el admin pueda tomar una acción rápida               |
+---------------+------------------------------------------------------+
| **Criterios   | - El formulario tiene tipos: contenedor lleno, vía   |
| de            |   bloqueada, trancón, accidente, otro                |
| aceptación:** |                                                      |
|               | - El admin recibe la notificación inmediatamente     |
|               |                                                      |
|               | - La novedad queda guardada en el historial          |
+---------------+------------------------------------------------------+
| **Sprint:**   | Sprint 2 --- Puntos de historia: 5                   |
+---------------+------------------------------------------------------+

+---------------+------------------------------------------------------+
| **Historia de | **GRS-15 --- Cambiar conductor de una ruta**         |
| Usuario**     |                                                      |
+---------------+------------------------------------------------------+
| **Como:**     | administrador                                        |
+---------------+------------------------------------------------------+
| **Quiero:**   | cambiar el conductor de una ruta indicando si es     |
|               | temporal o permanente                                |
+---------------+------------------------------------------------------+
| **Para que:** | quede un historial del cambio y el sistema se        |
|               | actualice                                            |
+---------------+------------------------------------------------------+
| **Criterios   | - El admin puede cambiar el conductor desde la       |
| de            |   gestión semanal                                    |
| aceptación:** |                                                      |
|               | - El sistema valida que el nuevo conductor no tenga  |
|               |   conflicto de jornada                               |
|               |                                                      |
|               | - El cambio queda registrado con fecha y motivo      |
|               |                                                      |
|               | - Si es permanente se actualiza el conductor por     |
|               |   defecto de la ruta                                 |
+---------------+------------------------------------------------------+
| **Sprint:**   | Sprint 2 --- Puntos de historia: 5                   |
+---------------+------------------------------------------------------+

+---------------+------------------------------------------------------+
| **Historia de | **GRS-16 --- Modo sin conexión**                     |
| Usuario**     |                                                      |
+---------------+------------------------------------------------------+
| **Como:**     | conductor                                            |
+---------------+------------------------------------------------------+
| **Quiero:**   | que la app funcione aunque no tenga internet y       |
|               | sincronice cuando vuelva la señal                    |
+---------------+------------------------------------------------------+
| **Para que:** | pueda seguir trabajando aunque pase por zonas sin    |
|               | cobertura                                            |
+---------------+------------------------------------------------------+
| **Criterios   | - La barra superior muestra si hay conexión o no     |
| de            |                                                      |
| aceptación:** | - Las paradas completadas sin internet se guardan en |
|               |   el teléfono                                        |
|               |                                                      |
|               | - Las novedades también se guardan localmente        |
|               |                                                      |
|               | - Al reconectarse todo se sube automáticamente al    |
|               |   servidor                                           |
|               |                                                      |
|               | - El conductor no tiene que hacer nada para          |
|               |   sincronizar                                        |
+---------------+------------------------------------------------------+
| **Sprint:**   | Sprint 2 --- Puntos de historia: 8                   |
+---------------+------------------------------------------------------+

**SPRINT 3 --- Reportes Ciudadanos y Dashboard**

Objetivo: implementar el sistema de reportes ciudadanos y el dashboard
de indicadores del administrador.

+---------------+------------------------------------------------------+
| **Historia de | **GRS-17 --- Enviar reporte de basura**              |
| Usuario**     |                                                      |
+---------------+------------------------------------------------------+
| **Como:**     | ciudadano                                            |
+---------------+------------------------------------------------------+
| **Quiero:**   | reportar un punto donde hay basura acumulada con     |
|               | foto, descripción y mi ubicación                     |
+---------------+------------------------------------------------------+
| **Para que:** | la empresa de aseo sepa dónde está el problema       |
+---------------+------------------------------------------------------+
| **Criterios   | - Puedo indicar mi ubicación con GPS o escribiendo   |
| de            |   la dirección                                       |
| aceptación:** |                                                      |
|               | - La foto es opcional pero recomendada               |
|               |                                                      |
|               | - El tipo de problema es obligatorio                 |
|               |                                                      |
|               | - Al enviar el reporte queda en estado pendiente     |
+---------------+------------------------------------------------------+
| **Sprint:**   | Sprint 3 --- Puntos de historia: 5                   |
+---------------+------------------------------------------------------+

+---------------+------------------------------------------------------+
| **Historia de | **GRS-18 --- Ver reportes en el mapa**               |
| Usuario**     |                                                      |
+---------------+------------------------------------------------------+
| **Como:**     | administrador                                        |
+---------------+------------------------------------------------------+
| **Quiero:**   | ver todos los reportes ciudadanos en el mapa con     |
|               | foto y descripción                                   |
+---------------+------------------------------------------------------+
| **Para que:** | pueda identificar las zonas con más problemas        |
+---------------+------------------------------------------------------+
| **Criterios   | - Los reportes aparecen como pines de colores según  |
| de            |   el estado                                          |
| aceptación:** |                                                      |
|               | - Al hacer clic en un pin se ven todos los detalles  |
|               |                                                      |
|               | - Se puede filtrar por estado en la lista            |
+---------------+------------------------------------------------------+
| **Sprint:**   | Sprint 3 --- Puntos de historia: 5                   |
+---------------+------------------------------------------------------+

+---------------+------------------------------------------------------+
| **Historia de | **GRS-19 --- Atender un reporte ciudadano**          |
| Usuario**     |                                                      |
+---------------+------------------------------------------------------+
| **Como:**     | administrador                                        |
+---------------+------------------------------------------------------+
| **Quiero:**   | asignar un reporte ciudadano a una ruta para que el  |
|               | conductor lo atienda                                 |
+---------------+------------------------------------------------------+
| **Para que:** | el punto crítico quede programado para ser recogido  |
+---------------+------------------------------------------------------+
| **Criterios   | - El admin puede asignar el reporte a una asignación |
| de            |   de la semana                                       |
| aceptación:** |                                                      |
|               | - El conductor recibe una notificación con los       |
|               |   detalles                                           |
|               |                                                      |
|               | - El reporte aparece como parada adicional en el     |
|               |   panel del conductor                                |
|               |                                                      |
|               | - Al marcar Recoger el reporte pasa a estado         |
|               |   resuelto                                           |
+---------------+------------------------------------------------------+
| **Sprint:**   | Sprint 3 --- Puntos de historia: 5                   |
+---------------+------------------------------------------------------+

+---------------+------------------------------------------------------+
| **Historia de | **GRS-20 --- Rechazar un reporte**                   |
| Usuario**     |                                                      |
+---------------+------------------------------------------------------+
| **Como:**     | administrador                                        |
+---------------+------------------------------------------------------+
| **Quiero:**   | rechazar un reporte ciudadano explicando el motivo   |
+---------------+------------------------------------------------------+
| **Para que:** | el ciudadano sepa por qué no fue atendido            |
+---------------+------------------------------------------------------+
| **Criterios   | - El admin escribe una justificación obligatoria     |
| de            |                                                      |
| aceptación:** | - El reporte cambia a estado rechazado               |
|               |                                                      |
|               | - El ciudadano puede ver el motivo en su historial   |
+---------------+------------------------------------------------------+
| **Sprint:**   | Sprint 3 --- Puntos de historia: 3                   |
+---------------+------------------------------------------------------+

+---------------+------------------------------------------------------+
| **Historia de | **GRS-21 --- Dashboard diario**                      |
| Usuario**     |                                                      |
+---------------+------------------------------------------------------+
| **Como:**     | administrador                                        |
+---------------+------------------------------------------------------+
| **Quiero:**   | ver un resumen del día con los indicadores más       |
|               | importantes en tiempo real                           |
+---------------+------------------------------------------------------+
| **Para que:** | tenga una visión rápida de cómo va la operación      |
+---------------+------------------------------------------------------+
| **Criterios   | - Muestra rutas programadas, activas, completadas e  |
| de            |   incompletas                                        |
| aceptación:** |                                                      |
|               | - Muestra conductores con inicio tardío y no         |
|               |   asistidos                                          |
|               |                                                      |
|               | - Muestra km recorridos y toneladas recolectadas del |
|               |   día                                                |
|               |                                                      |
|               | - Se actualiza automáticamente sin recargar la       |
|               |   página                                             |
+---------------+------------------------------------------------------+
| **Sprint:**   | Sprint 3 --- Puntos de historia: 8                   |
+---------------+------------------------------------------------------+

+---------------+------------------------------------------------------+
| **Historia de | **GRS-22 --- Dashboard semanal con gráfica**         |
| Usuario**     |                                                      |
+---------------+------------------------------------------------------+
| **Como:**     | administrador                                        |
+---------------+------------------------------------------------------+
| **Quiero:**   | ver una gráfica con las toneladas recolectadas por   |
|               | día y el rendimiento de los conductores              |
+---------------+------------------------------------------------------+
| **Para que:** | pueda comparar el desempeño de la semana             |
+---------------+------------------------------------------------------+
| **Criterios   | - Gráfica de barras con toneladas por día de la      |
| de            |   semana                                             |
| aceptación:** |                                                      |
|               | - Tabla con eficiencia por conductor                 |
|               |                                                      |
|               | - Se puede navegar entre semanas anteriores          |
+---------------+------------------------------------------------------+
| **Sprint:**   | Sprint 3 --- Puntos de historia: 8                   |
+---------------+------------------------------------------------------+

**SPRINT 4 --- Dashboard Mensual, Cierre y Optimización**

Objetivo: completar el dashboard mensual, la exportación de reportes, el
cierre de ruta y la optimización de la base de datos.

+---------------+------------------------------------------------------+
| **Historia de | **GRS-23 --- Dashboard mensual**                     |
| Usuario**     |                                                      |
+---------------+------------------------------------------------------+
| **Como:**     | administrador                                        |
+---------------+------------------------------------------------------+
| **Quiero:**   | ver el resumen del mes con gráficas de tendencia y   |
|               | ranking de conductores                               |
+---------------+------------------------------------------------------+
| **Para que:** | pueda evaluar el desempeño mensual de la empresa     |
+---------------+------------------------------------------------------+
| **Criterios   | - Gráfica de tendencia de toneladas por semana del   |
| de            |   mes                                                |
| aceptación:** |                                                      |
|               | - Ranking de eficiencia por conductor                |
|               |                                                      |
|               | - Se puede navegar entre meses anteriores            |
+---------------+------------------------------------------------------+
| **Sprint:**   | Sprint 4 --- Puntos de historia: 5                   |
+---------------+------------------------------------------------------+

+---------------+------------------------------------------------------+
| **Historia de | **GRS-24 --- Exportar reportes en PDF y CSV**        |
| Usuario**     |                                                      |
+---------------+------------------------------------------------------+
| **Como:**     | administrador                                        |
+---------------+------------------------------------------------------+
| **Quiero:**   | descargar el reporte de eficiencia en PDF o en Excel |
+---------------+------------------------------------------------------+
| **Para que:** | pueda compartirlo con directivos sin que necesiten   |
|               | acceso al sistema                                    |
+---------------+------------------------------------------------------+
| **Criterios   | - El botón PDF genera un archivo con el reporte      |
| de            |   completo                                           |
| aceptación:** |                                                      |
|               | - El botón CSV genera un archivo que se puede abrir  |
|               |   en Excel                                           |
|               |                                                      |
|               | - Se puede filtrar por rango de fechas antes de      |
|               |   exportar                                           |
+---------------+------------------------------------------------------+
| **Sprint:**   | Sprint 4 --- Puntos de historia: 5                   |
+---------------+------------------------------------------------------+

+---------------+------------------------------------------------------+
| **Historia de | **GRS-25 --- Finalizar ruta e indicadores            |
| Usuario**     | automáticos**                                        |
+---------------+------------------------------------------------------+
| **Como:**     | conductor                                            |
+---------------+------------------------------------------------------+
| **Quiero:**   | finalizar mi ruta al completar todos los sectores e  |
|               | ingresar las toneladas recolectadas                  |
+---------------+------------------------------------------------------+
| **Para que:** | el sistema calcule automáticamente los indicadores   |
|               | de eficiencia                                        |
+---------------+------------------------------------------------------+
| **Criterios   | - El botón de finalizar aparece cuando el progreso   |
| de            |   llega al 100%                                      |
| aceptación:** |                                                      |
|               | - El sistema pide ingresar las toneladas             |
|               |   recolectadas                                       |
|               |                                                      |
|               | - Se calcula automáticamente el tiempo total y el    |
|               |   porcentaje de cumplimiento                         |
|               |                                                      |
|               | - Los datos aparecen en el dashboard del             |
|               |   administrador                                      |
+---------------+------------------------------------------------------+
| **Sprint:**   | Sprint 4 --- Puntos de historia: 5                   |
+---------------+------------------------------------------------------+

+---------------+------------------------------------------------------+
| **Historia de | **GRS-26 --- Historial de auditoría**                |
| Usuario**     |                                                      |
+---------------+------------------------------------------------------+
| **Como:**     | administrador                                        |
+---------------+------------------------------------------------------+
| **Quiero:**   | ver el historial de todas las acciones importantes   |
|               | realizadas en el sistema                             |
+---------------+------------------------------------------------------+
| **Para que:** | tenga trazabilidad de los cambios para auditoría     |
+---------------+------------------------------------------------------+
| **Criterios   | - Se registran acciones como: crear ruta, editar     |
| de            |   conductor, cambiar configuración                   |
| aceptación:** |                                                      |
|               | - El historial muestra usuario, acción, fecha y      |
|               |   detalles                                           |
|               |                                                      |
|               | - Si se elimina un usuario sus registros se          |
|               |   conservan                                          |
+---------------+------------------------------------------------------+
| **Sprint:**   | Sprint 4 --- Puntos de historia: 3                   |
+---------------+------------------------------------------------------+

+---------------+------------------------------------------------------+
| **Historia de | **GRS-27 --- Pruebas del sistema**                   |
| Usuario**     |                                                      |
+---------------+------------------------------------------------------+
| **Como:**     | equipo de desarrollo                                 |
+---------------+------------------------------------------------------+
| **Quiero:**   | ejecutar pruebas automáticas para verificar que los  |
|               | módulos principales funcionan correctamente          |
+---------------+------------------------------------------------------+
| **Para que:** | se entregue un sistema estable sin errores críticos  |
+---------------+------------------------------------------------------+
| **Criterios   | - 8 pruebas automatizadas con Jest pasando (0        |
| de            |   fallidas)                                          |
| aceptación:** |                                                      |
|               | - Se prueba el trigger de copia de sectores al crear |
|               |   asignaciones                                       |
|               |                                                      |
|               | - Se prueba la conversión de días de la semana       |
|               |                                                      |
|               | - El linter ESLint arroja 0 errores                  |
+---------------+------------------------------------------------------+
| **Sprint:**   | Sprint 4 --- Puntos de historia: 5                   |
+---------------+------------------------------------------------------+

+---------------+------------------------------------------------------+
| **Historia de | **GRS-28 --- Documentación final**                   |
| Usuario**     |                                                      |
+---------------+------------------------------------------------------+
| **Como:**     | equipo de desarrollo                                 |
+---------------+------------------------------------------------------+
| **Quiero:**   | entregar toda la documentación del sistema completa  |
+---------------+------------------------------------------------------+
| **Para que:** | el proyecto esté listo para ser evaluado             |
+---------------+------------------------------------------------------+
| **Criterios   | - Manual técnico con arquitectura, base de datos y   |
| de            |   API                                                |
| aceptación:** |                                                      |
|               | - Manual de usuario para los tres roles              |
|               |                                                      |
|               | - IEEE SRS v2.0 actualizado                          |
|               |                                                      |
|               | - Historias de usuario completas                     |
|               |                                                      |
|               | - Diagramas del sistema actualizados                 |
+---------------+------------------------------------------------------+
| **Sprint:**   | Sprint 4 --- Puntos de historia: 3                   |
+---------------+------------------------------------------------------+

+---------------+------------------------------------------------------+
| **Historia de | **GRS-29 --- Optimización de base de datos**         |
| Usuario**     |                                                      |
+---------------+------------------------------------------------------+
| **Como:**     | desarrollador                                        |
+---------------+------------------------------------------------------+
| **Quiero:**   | migrar la base de datos al esquema final optimizado  |
|               | con PostGIS y sin redundancias                       |
+---------------+------------------------------------------------------+
| **Para que:** | la base de datos sea escalable y se pueda reproducir |
|               | fácilmente en otro servidor                          |
+---------------+------------------------------------------------------+
| **Criterios   | - 8 archivos de migración SQL documentados           |
| de            |                                                      |
| aceptación:** | - Los días de la semana se guardan como números (ISO |
|               |   8601)                                              |
|               |                                                      |
|               | - Se elimina la redundancia de conductor_id y        |
|               |   vehiculo_id en asignaciones                        |
|               |                                                      |
|               | - La tabla de eficiencia se convierte en una vista   |
|               |   que se actualiza automáticamente                   |
|               |                                                      |
|               | - El trazado de rutas usa PostGIS con índice         |
|               |   espacial GIST                                      |
+---------------+------------------------------------------------------+
| **Sprint:**   | Sprint 4 --- Puntos de historia: 8                   |
+---------------+------------------------------------------------------+

**Total: 29 historias de usuario \| 164 puntos de historia \| 4 sprints
completados**
