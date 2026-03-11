const mqtt = require('mqtt');
require('dotenv').config();

// Configuración del broker MQTT desde variables de entorno
const MQTT_CONFIG = {
  host: 'ingestapre.thesmartdelivery.com',
  port: 1883,
  username: 'verneAgent',
  password: 'LOIGK3xsdSGLJ',
  clientId: `mqtt_publisher_test_${Math.random().toString(16).slice(3)}`
};

// SNU de prueba (nevera específica)
const TEST_SNU = '019929bf-ee7f-7d05-a659-3532fe0d8802';
let TEST_SIDS = []; // Array con 5 SIDs (uno por cada servicio)

// Secuencia de mensajes: 3 servicios sin finalizar + 1 servicio completo + 1 servicio + reset (simultáneos)
const TEST_SEQUENCE = [
  // SERVICIO 1 (SID1) - SIN FINALIZAR
  { dvs: 3, log: 8,  sidIndex: 0, includeSid: true  },  // Mensaje 1: Inicio servicio 1
  { dvs: 3, log: 1,  sidIndex: 0, includeSid: true  },  // Mensaje 2: Telemetría servicio 1
  
  // SERVICIO 2 (SID2) - SIN FINALIZAR
  { dvs: 3, log: 8,  sidIndex: 1, includeSid: true  },  // Mensaje 3: Inicio servicio 2
  { dvs: 3, log: 1,  sidIndex: 1, includeSid: true  },  // Mensaje 4: Telemetría servicio 2
  
  // SERVICIO 3 (SID3) - COMPLETAMENTE FINALIZADO (sigue messages-config.json)
  { dvs: 3, log: 8,  sidIndex: 2, includeSid: true  },  // Mensaje 5: Inicio
  { dvs: 3, log: 1,  sidIndex: 2, includeSid: true  },  // Mensaje 6: Telemetría recogida
  { dvs: 4, log: 16, sidIndex: 2, includeSid: true  },  // Mensaje 7: En tránsito
  { dvs: 4, log: 1,  sidIndex: 2, includeSid: true  },  // Mensaje 8: Telemetría tránsito
  { dvs: 5, log: 14, sidIndex: 2, includeSid: true  },  // Mensaje 9: Siguiente estado
  { dvs: 5, log: 1,  sidIndex: 2, includeSid: true  },  // Mensaje 10: Telemetría
  { dvs: 6, log: 23, sidIndex: 2, includeSid: true  },  // Mensaje 11: Entregado
  { dvs: 6, log: 1,  sidIndex: 2, includeSid: true  },  // Mensaje 12: Confirmación
  { dvs: 7, log: 21, sidIndex: 2, includeSid: true  },  // Mensaje 13: Final
  { dvs: 7, log: 1,  sidIndex: 2, includeSid: true  },  // Mensaje 14: Finalación completa
  
  // SERVICIO 4 (SID4) - SIN FINALIZAR
  { dvs: 3, log: 8,  sidIndex: 3, includeSid: true  },  // Mensaje 15: Inicio servicio 4
  { dvs: 3, log: 1,  sidIndex: 3, includeSid: true  },  // Mensaje 16: Telemetría servicio 4
  
  // SERVICIO 5 (SID5) + RESET SIN SID (SIMULTÁNEOS)
  { dvs: 3, log: 8,  sidIndex: 4, includeSid: true, simultaneous: true  },  // Mensaje 17: Inicio servicio 5
  { dvs: 4, log: 2,  sidIndex: null, includeSid: false, simultaneous: true } // Mensaje 18: RESET (sin SID) - al mismo tiempo
];

console.log('🚀 Iniciando test publisher (escenario: LOG Reset sin SID)...');
console.log(`📡 Conectando a: ${MQTT_CONFIG.host}:${MQTT_CONFIG.port}`);

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

// Función para generar datos de nevera según el paso de la secuencia
function generateCoolerData(step) {
  const now = Math.floor(Date.now() / 1000);
  
  // Determinar cuál SID usar
  let sidValue = 0; // Por defecto 0 (para reset sin SID válido)
  if (step.includeSid && step.sidIndex !== null) {
    sidValue = parseInt(TEST_SIDS[step.sidIndex]);
  }
  
  // Si LOG es 2 (reset), enviar LAT y LON como 0
  const lat = step.log === 2 ? 0 : 42.0407;
  const lon = step.log === 2 ? 0 : 2.9137;
  
  const payload = {
    SNU: TEST_SNU,
    SID: sidValue, // Siempre incluir SID, pero 0 si no hay SID válido
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
    LOG: step.log, // LOG según el paso
    SER: {
      MNT: 0,
      MXT: 1,
      STE: 0,
      ORE: 0,
      SHK: 0
    },
    DVS: step.dvs, // DVS según el paso
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

  return payload;
}

// Función para publicar mensaje (versión mejorada)
function publishMessage(step, stepIndex) {
  const topic = `cooler_mqtt/ics/${TEST_SNU}`;
  const payload = generateCoolerData(step);
  const message = JSON.stringify(payload);
  
  client.publish(topic, message, { qos: 0 }, (err) => {
    if (err) {
      console.error(`❌ Error publicando mensaje ${stepIndex + 1}/${TEST_SEQUENCE.length}:`, err.message);
    } else {
      messageCount++;
      const timestamp = new Date().toLocaleString('es-ES');
      
      // Determinar qué SID mostrar
      let sidDisplay;
      if (step.includeSid && step.sidIndex !== null) {
        sidDisplay = `SID${step.sidIndex + 1}: ${payload.SID}`;
      } else {
        sidDisplay = `SID: 0 (RESET)`;
      }
      
      console.log(`✅ [${stepIndex + 1}/${TEST_SEQUENCE.length}] Mensaje enviado`);
      console.log(`   🕐 Timestamp: ${timestamp}`);
      console.log(`   📋 DVS: ${step.dvs} | LOG: ${step.log} | ${sidDisplay}`);
      console.log(`   🌡️  TMP: ${payload.TMP}°C | BAT: ${payload.BPR}%\n`);
    }
  });
}

// Función para enviar mensajes secuencialmente con delay
function sendMessagesSequentially() {
  TEST_SEQUENCE.forEach((step, index) => {
    // Si este es parte de un envío simultáneo (simultaneous: true)
    // solo lo enviamos si es el primero o lo manejamos como par
    if (step.simultaneous && index > 0 && TEST_SEQUENCE[index - 1].simultaneous) {
      // Este es el segundo mensaje de un par simultáneo, usar el mismo delay
      const previousDelay = (index - 1) * 1500;
      setTimeout(() => {
        publishMessage(step, index);
        
        // Después del último mensaje, cerramos la conexión
        if (index === TEST_SEQUENCE.length - 1) {
          setTimeout(() => {
            console.log('✅ Todos los mensajes completados. Terminando...\n');
            cleanup();
          }, 1000);
        }
      }, previousDelay);
    } else if (!step.simultaneous || index === 0 || !TEST_SEQUENCE[index - 1].simultaneous) {
      // Mensaje normal o primer mensaje de un par simultáneo
      const delay = index * 1500; // 1500ms de separación entre mensajes
      
      setTimeout(() => {
        publishMessage(step, index);
        
        // Después del último mensaje, cerramos la conexión
        if (index === TEST_SEQUENCE.length - 1) {
          setTimeout(() => {
            console.log('✅ Todos los mensajes completados. Terminando...\n');
            cleanup();
          }, 1000);
        }
      }, delay);
    }
  });
}

// Evento: Conexión exitosa
client.on('connect', () => {
  console.log('✅ Conectado al broker MQTT\n');
  
  // Generar 5 SIDs dinámicamente (uno por cada servicio)
  const baseTimestamp = Math.floor(Date.now() / 1000);
  TEST_SIDS = [
    baseTimestamp.toString(),
    (baseTimestamp + 1).toString(),
    (baseTimestamp + 2).toString(),
    (baseTimestamp + 3).toString(),
    (baseTimestamp + 4).toString()
  ];
  
  console.log(`🔢 SIDs generados (timestamps):`);
  TEST_SIDS.forEach((sid, idx) => console.log(`   SID${idx + 1}: ${sid}`));
  
  console.log(`\n📋 Total mensajes a enviar: ${TEST_SEQUENCE.length}`);
  console.log(`⏱️  Escenario: 3 servicios sin finalizar + 1 servicio completo + 1 servicio creado SIMULTÁNEAMENTE con LOG:2 reset\n`);
  console.log('📤 Enviando mensajes con 1.5 segundos de separación...\n');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // Iniciar envío secuencial
  sendMessagesSequentially();
});

// Evento: Error
client.on('error', (error) => {
  // Filtrar errores comunes de reconexión
  if (!error.message.includes('client disconnecting')) {
    console.error('❌ Error en conexión MQTT:', error.message);
  }
});

// Evento: Reconexión
client.on('reconnect', () => {
  console.log('🔄 Intentando reconectar...');
});

// Evento: Desconexión
client.on('close', () => {
  console.log('🔌 Desconectado del broker MQTT');
});

// Evento: Offline
client.on('offline', () => {
  console.log('📴 Cliente MQTT offline');
});

// Manejo de señales para cerrar limpiamente
function cleanup() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('👋 Cerrando conexión...');
  
  // Limpiar intervalos si existen
  intervalIds.forEach(id => clearInterval(id));
  intervalIds = [];
  
  client.end(false, () => {
    console.log('✅ Conexión cerrada correctamente');
    console.log(`📊 Total de mensajes enviados: ${messageCount}/${TEST_SEQUENCE.length}`);
    console.log('\n📈 Resumen:');
    console.log(`   • Servicio 1 (SID${1}: ${TEST_SIDS[0]}) - SIN FINALIZAR`);
    console.log(`   • Servicio 2 (SID${2}: ${TEST_SIDS[1]}) - SIN FINALIZAR`);
    console.log(`   • Servicio 3 (SID${3}: ${TEST_SIDS[2]}) - COMPLETADO`);
    console.log(`   • Servicio 4 (SID${4}: ${TEST_SIDS[3]}) - SIN FINALIZAR`);
    console.log(`   • Servicio 5 (SID${5}: ${TEST_SIDS[4]}) - CREADO + RESET SIMULTÁNEO`);
    console.log(`   • Reset enviado (LOG:2 con SID:0, LAT:0, LON:0) - AL MISMO TIEMPO QUE SERVICIO 5`);
    process.exit(0);
  });
  
  // Timeout de seguridad
  setTimeout(() => process.exit(0), 2000);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
