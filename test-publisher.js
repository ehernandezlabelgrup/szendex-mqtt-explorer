const mqtt = require('mqtt');
require('dotenv').config();

// Configuración del broker MQTT
const MQTT_CONFIG = {
  host: 'ingestapre.thesmartdelivery.com',
  port: 1883,
  username: 'verneAgent',
  password: 'LOIGK3xsdSGLJ',
  clientId: `mqtt_test_${Math.random().toString(16).slice(3)}`
};

// SNU de prueba (nevera específica)
const TEST_SNU = '019929bf-ee7f-7d05-a659-3532fe0d8802';
let TEST_SIDS = [];

// Determinar escenario desde argumentos
const SCENARIO = process.argv[2] || 'log2';
let TEST_SEQUENCE = [];
let SCENARIO_CONFIG = {};

// ============================================================================
// ESCENARIO 1: LOG-2 (5 servicios con edge cases)
// ============================================================================
function generateLog2Sequence() {
  return [
    // SERVICIO 1 (SID1) - SIN FINALIZAR
    { dvs: 3, log: 8,  sidIndex: 0, includeSid: true  },  // Inicio
    { dvs: 3, log: 1,  sidIndex: 0, includeSid: true  },  // Telemetría
    
    // SERVICIO 2 (SID2) - SIN FINALIZAR
    { dvs: 3, log: 8,  sidIndex: 1, includeSid: true  },  // Inicio
    { dvs: 3, log: 1,  sidIndex: 1, includeSid: true  },  // Telemetría
    
    // SERVICIO 3 (SID3) - COMPLETAMENTE FINALIZADO
    { dvs: 3, log: 8,  sidIndex: 2, includeSid: true  },  // Inicio
    { dvs: 3, log: 1,  sidIndex: 2, includeSid: true  },  // Telemetría
    { dvs: 4, log: 16, sidIndex: 2, includeSid: true  },  // Tránsito
    { dvs: 4, log: 1,  sidIndex: 2, includeSid: true  },  // Telemetría
    { dvs: 5, log: 14, sidIndex: 2, includeSid: true  },  // Siguiente
    { dvs: 5, log: 1,  sidIndex: 2, includeSid: true  },  // Telemetría
    { dvs: 6, log: 23, sidIndex: 2, includeSid: true  },  // Entregado
    { dvs: 6, log: 1,  sidIndex: 2, includeSid: true  },  // Confirmación
    { dvs: 7, log: 21, sidIndex: 2, includeSid: true  },  // Final
    { dvs: 7, log: 1,  sidIndex: 2, includeSid: true  },  // Finalización
    
    // SERVICIO 4 (SID4) - SIN FINALIZAR
    { dvs: 3, log: 8,  sidIndex: 3, includeSid: true  },  // Inicio
    { dvs: 3, log: 1,  sidIndex: 3, includeSid: true  },  // Telemetría
    
    // SERVICIO 5 (SID5) + RESET SIMULTÁNEO
    { dvs: 3, log: 8,  sidIndex: 4, includeSid: true, simultaneous: true  },  // Inicio
    { dvs: 4, log: 2,  sidIndex: null, includeSid: false, simultaneous: true } // RESET
  ];
}

// ============================================================================
// ESCENARIO 2: STRESS (20 servicios + RESET + 6 servicios sin reset)
// ============================================================================
function generateStressSequence() {
  const sequence = [];
  const INCOMPLETE_SERVICES = 16;
  const COMPLETE_SERVICES = 4;
  const PHASE2_INCOMPLETE = 5;
  const PHASE2_COMPLETE = 1;
  
  // ========== FASE 1: 20 servicios + Reset ==========
  // Servicios incompletos (2 mensajes cada uno)
  for (let i = 0; i < INCOMPLETE_SERVICES; i++) {
    sequence.push({ dvs: 3, log: 8, sidIndex: i, includeSid: true });
    sequence.push({ dvs: 3, log: 1, sidIndex: i, includeSid: true });
  }
  
  // Servicios completos (10 mensajes cada uno)
  const completeSequence = [
    { dvs: 3, log: 8 },   { dvs: 3, log: 1 },
    { dvs: 4, log: 16 },  { dvs: 4, log: 1 },
    { dvs: 5, log: 14 },  { dvs: 5, log: 1 },
    { dvs: 6, log: 23 },  { dvs: 6, log: 1 },
    { dvs: 7, log: 21 },  { dvs: 7, log: 1 }
  ];
  
  for (let i = 0; i < COMPLETE_SERVICES; i++) {
    const sidIndex = INCOMPLETE_SERVICES + i;
    completeSequence.forEach(msg => {
      sequence.push({
        dvs: msg.dvs,
        log: msg.log,
        sidIndex: sidIndex,
        includeSid: true
      });
    });
  }
  
  // Reset (finaliza fase 1)
  sequence.push({ dvs: 4, log: 2, sidIndex: null, includeSid: false, phase1End: true });
  
  // ========== PAUSA entre fases (8 segundos) ==========
  sequence.push({ pause: true, duration: 8000, phase2Start: true });
  
  // ========== FASE 2: 6 servicios sin reset ==========
  const phase2Offset = INCOMPLETE_SERVICES + COMPLETE_SERVICES;
  
  // Servicios incompletos fase 2 (2 mensajes cada uno)
  for (let i = 0; i < PHASE2_INCOMPLETE; i++) {
    const sidIndex = phase2Offset + i;
    sequence.push({ dvs: 3, log: 8, sidIndex: sidIndex, includeSid: true });
    sequence.push({ dvs: 3, log: 1, sidIndex: sidIndex, includeSid: true });
  }
  
  // Servicios completos fase 2 (10 mensajes)
  for (let i = 0; i < PHASE2_COMPLETE; i++) {
    const sidIndex = phase2Offset + PHASE2_INCOMPLETE + i;
    completeSequence.forEach(msg => {
      sequence.push({
        dvs: msg.dvs,
        log: msg.log,
        sidIndex: sidIndex,
        includeSid: true
      });
    });
  }
  
  // ========== PAUSA entre fases (8 segundos) ==========
  sequence.push({ pause: true, duration: 8000, phase3Start: true });
  
  // ========== FASE 3: 7 servicios con LOG especiales ==========
  const phase3Offset = phase2Offset + PHASE2_INCOMPLETE + PHASE2_COMPLETE;
  
  // Servicio 1: Incompleto (no finaliza)
  sequence.push({ dvs: 3, log: 8, sidIndex: phase3Offset, includeSid: true });
  sequence.push({ dvs: 3, log: 1, sidIndex: phase3Offset, includeSid: true });
  
  // Servicio 2: Con LOG 11 a mitad
  sequence.push({ dvs: 3, log: 8, sidIndex: phase3Offset + 1, includeSid: true });
  sequence.push({ dvs: 4, log: 11, sidIndex: phase3Offset + 1, includeSid: true });
  sequence.push({ dvs: 4, log: 1, sidIndex: phase3Offset + 1, includeSid: true });
  
  // Servicio 3: Con LOG 24 a mitad
  sequence.push({ dvs: 3, log: 8, sidIndex: phase3Offset + 2, includeSid: true });
  sequence.push({ dvs: 6, log: 24, sidIndex: phase3Offset + 2, includeSid: true });
  sequence.push({ dvs: 6, log: 1, sidIndex: phase3Offset + 2, includeSid: true });
  
  // Servicio 4: Completo (finaliza)
  completeSequence.forEach(msg => {
    sequence.push({
      dvs: msg.dvs,
      log: msg.log,
      sidIndex: phase3Offset + 3,
      includeSid: true
    });
  });
  
  // Servicio 5: Incompleto (no finaliza)
  sequence.push({ dvs: 3, log: 8, sidIndex: phase3Offset + 4, includeSid: true });
  sequence.push({ dvs: 3, log: 1, sidIndex: phase3Offset + 4, includeSid: true });
  
  // Servicio 6: Completo (finaliza)
  completeSequence.forEach(msg => {
    sequence.push({
      dvs: msg.dvs,
      log: msg.log,
      sidIndex: phase3Offset + 5,
      includeSid: true
    });
  });
  
  return sequence;
}

// Seleccionar escenario
if (SCENARIO === 'stress') {
  TEST_SEQUENCE = generateStressSequence();
  SCENARIO_CONFIG = {
    name: 'STRESS TEST ULTRA EXTENDIDO',
    description: '3 fases: 20 + reset, 6 sin reset, 6 con LOG especiales',
    delay: 800,
    totalServices: 32,
    phase1: { incomplete: 16, complete: 4, total: 20, hasReset: true },
    phase2: { incomplete: 5, complete: 1, total: 6, hasReset: false },
    phase3: { incomplete: 4, complete: 2, total: 6, hasReset: false },
    pauseDuration: 8000
  };
} else {
  TEST_SEQUENCE = generateLog2Sequence();
  SCENARIO_CONFIG = {
    name: 'LOG-2 RESET TEST',
    description: '5 servicios con edge cases',
    delay: 1500,
    totalServices: 5,
    incompleteServices: 3,
    completeServices: 1
  };
}

console.log('🚀 Iniciando test publisher');
console.log(`📡 Conectando a: ${MQTT_CONFIG.host}:${MQTT_CONFIG.port}`);
console.log(`📋 Escenario: ${SCENARIO_CONFIG.name}`);

// Crear cliente MQTT
const client = mqtt.connect(`mqtt://${MQTT_CONFIG.host}:${MQTT_CONFIG.port}`, {
  username: MQTT_CONFIG.username,
  password: MQTT_CONFIG.password,
  clientId: MQTT_CONFIG.clientId,
  clean: true,
  reconnectPeriod: 5000,
  connectTimeout: 30000,
  protocolVersion: 4
});

let messageCount = 0;
let intervalIds = [];

// Generar datos de nevera
function generateCoolerData(step) {
  const now = Math.floor(Date.now() / 1000);
  
  let sidValue = 0;
  if (step.includeSid && step.sidIndex !== null) {
    sidValue = parseInt(TEST_SIDS[step.sidIndex]);
  }
  
  const lat = step.log === 2 ? 0 : 42.0407;
  const lon = step.log === 2 ? 0 : 2.9137;
  
  return {
    SNU: TEST_SNU,
    SID: sidValue,
    TSP: now,
    LON: lon,
    LAT: lat,
    ORG: 0,
    DST: 0,
    STY: 255,
    TMP: 21.7,
    BMV: 8420,
    BPR: 98,
    STS: 32260,
    LOG: step.log,
    SER: {
      MNT: 0,
      MXT: 1,
      STE: 0,
      ORE: 0,
      SHK: 0
    },
    DVS: step.dvs,
    RSS: 17,
    BCN: 7,
    VLM: 0,
    ICN: 0,
    NST: 17.6,
    XST: 23.8,
    LGC: 815300,
    FWV: "3.3",
    USP: 3,
    serviceTimeError: 0
  };
}

// Publicar mensaje
function publishMessage(step, stepIndex) {
  const topic = `cooler_mqtt/ics/${TEST_SNU}`;
  const payload = generateCoolerData(step);
  const message = JSON.stringify(payload);
  
  client.publish(topic, message, { qos: 0 }, (err) => {
    if (err) {
      console.error(`❌ Error [${stepIndex + 1}/${TEST_SEQUENCE.length}]:`, err.message);
    } else {
      messageCount++;
      
      let sidDisplay;
      if (step.includeSid && step.sidIndex !== null) {
        sidDisplay = `SRV${step.sidIndex + 1}`;
      } else {
        sidDisplay = 'RESET';
      }
      
      console.log(`✅ [${stepIndex + 1}/${TEST_SEQUENCE.length}] ${sidDisplay} | DVS:${step.dvs} | LOG:${step.log}`);
    }
  });
}

// Enviar mensajes secuencialmente
function sendMessagesSequentially() {
  console.log(`\n📋 Total items: ${TEST_SEQUENCE.length}`);
  console.log(`⏱️  Intervalo: ${SCENARIO_CONFIG.delay}ms`);
  console.log(`📤 Enviando...\n`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  let cumulativeDelay = 0;
  
  TEST_SEQUENCE.forEach((step, index) => {
    // Si es una pausa
    if (step.pause) {
      cumulativeDelay += step.duration;
      
      setTimeout(() => {
        console.log(`\n⏸️  PAUSA: Esperando ${step.duration / 1000} segundos...`);
        console.log(`📍 Fase 2: Nuevos servicios están siendo creados sin reset posterior\n`);
      }, cumulativeDelay - step.duration);
      
      return;
    }
    
    // Manejo de mensajes simultáneos (solo para LOG-2)
    if (step.simultaneous && index > 0 && TEST_SEQUENCE[index - 1].simultaneous) {
      const previousStepDelay = index > 1 ? (index - 1) * SCENARIO_CONFIG.delay : 0;
      const delay = cumulativeDelay + previousStepDelay;
      
      setTimeout(() => {
        publishMessage(step, index);
        if (index === TEST_SEQUENCE.length - 1) {
          setTimeout(() => {
            console.log('\n═══════════════════════════════════════════════════════════════');
            console.log('✅ Todos los mensajes completados. Terminando...\n');
            cleanup();
          }, 1000);
        }
      }, delay);
    } else if (!step.simultaneous || index === 0 || !TEST_SEQUENCE[index - 1].simultaneous) {
      let messageDelay = 0;
      
      // Calcular delay basado en índices anteriores no-pausa
      let nonPauseCount = 0;
      for (let i = 0; i < index; i++) {
        if (!TEST_SEQUENCE[i].pause) {
          nonPauseCount++;
        }
      }
      
      messageDelay = nonPauseCount * SCENARIO_CONFIG.delay;
      const totalDelay = cumulativeDelay + messageDelay;
      
      setTimeout(() => {
        publishMessage(step, index);
        if (index === TEST_SEQUENCE.length - 1) {
          setTimeout(() => {
            console.log('\n═══════════════════════════════════════════════════════════════');
            console.log('✅ Todos los mensajes completados. Terminando...\n');
            cleanup();
          }, 1000);
        }
      }, totalDelay);
    }
  });
}

// Conexión exitosa
client.on('connect', () => {
  console.log('✅ Conectado al broker MQTT\n');
  
  // Generar SIDs dinámicamente
  const baseTimestamp = Math.floor(Date.now() / 1000);
  TEST_SIDS = [];
  for (let i = 0; i < SCENARIO_CONFIG.totalServices; i++) {
    TEST_SIDS.push((baseTimestamp + i).toString());
  }
  
  console.log(`🔢 ${SCENARIO_CONFIG.totalServices} SIDs generados\n`);
  
  // Iniciar envío
  sendMessagesSequentially();
});

// Manejo de errores
client.on('error', (error) => {
  if (!error.message.includes('client disconnecting')) {
    console.error('❌ Error MQTT:', error.message);
  }
});

client.on('reconnect', () => {
  console.log('🔄 Reconectando...');
});

client.on('close', () => {
  console.log('🔌 Desconectado');
});

client.on('offline', () => {
  console.log('📴 Offline');
});

// Limpieza
function cleanup() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('👋 Cerrando conexión...');
  
  intervalIds.forEach(id => clearInterval(id));
  intervalIds = [];
  
  client.end(false, () => {
    console.log('✅ Conexión cerrada correctamente');
    console.log(`📊 Total enviados: ${messageCount}`);
    console.log('\n📈 Resumen:');
    console.log(`   • Escenario: ${SCENARIO_CONFIG.name}`);
    
    if (SCENARIO_CONFIG.phase1) {
      // Stress test con tres fases
      console.log(`\n   FASE 1 (con reset):`);
      console.log(`   • Servicios incompletos: ${SCENARIO_CONFIG.phase1.incomplete} (cancelados por reset)`);
      console.log(`   • Servicios completados: ${SCENARIO_CONFIG.phase1.complete}`);
      console.log(`   • Reset: LOG:2 con SID:0, LAT:0, LON:0`);
      
      console.log(`\n   PAUSA: ${SCENARIO_CONFIG.pauseDuration / 1000} segundos`);
      
      console.log(`\n   FASE 2 (sin reset):`);
      console.log(`   • Servicios incompletos: ${SCENARIO_CONFIG.phase2.incomplete} (permanecen activos)`);
      console.log(`   • Servicios completados: ${SCENARIO_CONFIG.phase2.complete}`);
      console.log(`   • Total fase 2: ${SCENARIO_CONFIG.phase2.total} servicios`);
      
      console.log(`\n   PAUSA: ${SCENARIO_CONFIG.pauseDuration / 1000} segundos`);
      
      console.log(`\n   FASE 3 (logs especiales, sin reset):`);
      console.log(`   • Servicios incompletos: ${SCENARIO_CONFIG.phase3.incomplete} (permanecen activos)`);
      console.log(`     - 2 servicios con LOG especiales (LOG:11, LOG:24)`);
      console.log(`   • Servicios completados: ${SCENARIO_CONFIG.phase3.complete}`);
      console.log(`   • Total fase 3: ${SCENARIO_CONFIG.phase3.total} servicios`);
      
      console.log(`\n   TOTAL: ${SCENARIO_CONFIG.totalServices} servicios`);
    } else {
      // LOG-2 test
      console.log(`   • Total servicios: ${SCENARIO_CONFIG.totalServices}`);
      console.log(`   • Servicios incompletos (cancelados): ${SCENARIO_CONFIG.incompleteServices}`);
      console.log(`   • Servicios completados (permanecen): ${SCENARIO_CONFIG.completeServices}`);
      console.log(`   • Reset enviado: LOG:2 con SID:0, LAT:0, LON:0`);
    }
    
    process.exit(0);
  });
  
  setTimeout(() => process.exit(0), 2000);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
