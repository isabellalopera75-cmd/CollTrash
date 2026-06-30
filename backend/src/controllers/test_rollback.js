const pool = require('C:/proyectos/colltrash/backend/src/config/database');
const { reasignarAsignacion } = require('C:/proyectos/colltrash/backend/src/controllers/asignacionesController');

async function run() {
  try {
    console.log("=== PRUEBA 3: ROLLBACK DE TRANSACCIONES (DINÁMICO) ===");

    // 1. Encontrar una asignación pendiente
    const asigRes = await pool.query(
      `SELECT a.id, a.fecha, a.ruta_fija_id, rf.jornada_id, rf.conductor_default_id, rf.vehiculo_id 
       FROM asignaciones_semanales a
       JOIN rutas_fijas rf ON rf.id = a.ruta_fija_id
       WHERE a.estado = 'pendiente' LIMIT 1`
    );

    if (asigRes.rows.length === 0) {
      throw new Error("No hay asignaciones pendientes para probar.");
    }

    const testAsig = asigRes.rows[0];
    const { id: asignacionId, fecha, ruta_fija_id, jornada_id, conductor_default_id: initialConductor, vehiculo_id: initialVehiculo } = testAsig;

    const fechaAsig = new Date(fecha).toISOString().split('T')[0];
    console.log(`Asignación de prueba seleccionada: ID ${asignacionId}, Ruta ID ${ruta_fija_id}, Fecha ${fechaAsig}, Jornada ${jornada_id}`);
    console.log(`Conductor original: ${initialConductor}, Vehículo original: ${initialVehiculo}`);

    // Encontrar un conductor y vehículo libres (sin conflicto) para esa fecha y jornada
    const todosConductores = await pool.query("SELECT id FROM usuarios WHERE rol = 'conductor'");
    const todosVehiculos = await pool.query("SELECT id FROM vehiculos");

    let targetConductor = null;
    let targetVehiculo = null;

    for (const c of todosConductores.rows) {
      for (const v of todosVehiculos.rows) {
        // Verificar si hay conflicto
        const conflictos = await pool.query(
          `SELECT a.id
           FROM asignaciones_semanales a
           JOIN rutas_fijas rf ON rf.id = a.ruta_fija_id
           WHERE a.fecha = $1 
             AND rf.jornada_id = $2 
             AND a.id != $3
             AND (rf.conductor_default_id = $4 OR rf.vehiculo_id = $5)`,
          [fechaAsig, jornada_id, asignacionId, c.id, v.id]
        );

        if (conflictos.rows.length === 0) {
          targetConductor = c.id;
          targetVehiculo = v.id;
          break;
        }
      }
      if (targetConductor) break;
    }

    if (!targetConductor) {
      throw new Error("No se encontró ningún conductor/vehículo sin conflicto para la prueba.");
    }

    console.log(`Seleccionados para reasignar (sin conflicto): Conductor ID ${targetConductor}, Vehículo ID ${targetVehiculo}`);

    // Limpiar cualquier cambio previo para esta fecha y ruta si existe en cambios_conductor
    await pool.query("DELETE FROM cambios_conductor WHERE ruta_fija_id = $1 AND fecha_inicio = $2", [ruta_fija_id, fechaAsig]);

    // Obtener recuento inicial de cambios_conductor
    const ccCountBefore = await pool.query("SELECT COUNT(*) FROM cambios_conductor");
    const initialCCCount = parseInt(ccCountBefore.rows[0].count);

    // Mock Express res/req
    const mockRes = {
      statusCode: 200,
      status: function(code) {
        this.statusCode = code;
        return this;
      },
      json: function(data) {
        this.data = data;
        return this;
      }
    };

    const reqReasignar = {
      params: { id: asignacionId },
      body: {
        conductor_id: targetConductor,
        vehiculo_id: targetVehiculo,
        es_permanente: false,
        motivo: 'Prueba Rollback'
      }
    };

    console.log(`Llamando reasignarAsignacion()...`);
    await reasignarAsignacion(reqReasignar, mockRes);
    console.log("Respuesta controller status:", mockRes.statusCode);
    console.log("Respuesta controller data:", mockRes.data);

    // 2. Verificar BD
    const ccCountAfter = await pool.query("SELECT COUNT(*) FROM cambios_conductor");
    const finalCCCount = parseInt(ccCountAfter.rows[0].count);

    const rfCheck = await pool.query("SELECT conductor_default_id, vehiculo_id FROM rutas_fijas WHERE id = $1", [ruta_fija_id]);
    const finalConductor = rfCheck.rows[0].conductor_default_id;
    const finalVehiculo = rfCheck.rows[0].vehiculo_id;

    console.log("\n=== COMPROBACIÓN DE ROLLBACK ===");
    console.log(`Cambios Conductor: Antes = ${initialCCCount}, Después = ${finalCCCount}`);
    console.log(`Rutas Fijas Conductor: Antes = ${initialConductor}, Después = ${finalConductor}`);

    const CCNoCambio = initialCCCount === finalCCCount;
    const RFNoCambio = initialConductor === finalConductor;

    if (CCNoCambio && RFNoCambio && mockRes.statusCode === 500) {
      console.log("\n✅ TRANSACCIÓN ROLLBACK ÉXITO: Ninguna tabla fue modificada debido al error forzado!");
    } else {
      console.error("\n❌ ERROR: Las tablas sufrieron modificaciones o la transacción no falló correctamente.");
    }

  } catch (e) {
    console.error("Error en prueba 3:", e.message);
  } finally {
    pool.end();
  }
}

run();
