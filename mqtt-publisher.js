const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuración del broker MQTT desde variables de entorno
const MQTT_CONFIG = {
  host: process.env.MQTT_HOST,
  port: parseInt(process.env.MQTT_PORT) || 1883,
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  clientId: `mqtt_publisher_${Math.random().toString(16).slice(3)}`
};

// SNUs de las neveras (UUIDs)
const COOLERS = [
  '019929bf-ee7f-7d05-a659-3532fe0d8802',
];

// Coordenadas base (Granollers, Catalonia)
const BASE_LAT = 42.0714;
const BASE_LON = 2.8155;

// Mapeo de SID por nevera (constante para cada una)
const COOLER_SIDS = {
  '019929bf-ee7f-7d05-a659-3532fe0d8802': null, // Se asignará en tiempo de ejecución
};

// Cargar patrones de mensajes desde archivo de configuración
const configPath = path.join(__dirname, 'messages-config.json');
let MESSAGE_PATTERNS = [];

try {
  const configData = fs.readFileSync(configPath, 'utf8');
  MESSAGE_PATTERNS = JSON.parse(configData);
  console.log(`📋 Patrones cargados desde: messages-config.json (${MESSAGE_PATTERNS.length} patrones)\n`);
} catch (error) {
  console.error('❌ Error al cargar messages-config.json:', error.message);
  process.exit(1);
}

let patternIndex = 0;

console.log('🚀 Iniciando publicador MQTT...');
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

// Contador de mensajes
let messageCount = 0;
let acksReceived = 0;
let intervalIds = [];

// Función para generar datos realistas de nevera
function generateCoolerData(snu) {
  const now = Math.floor(Date.now() / 1000);
  
  // Variar un poco las coordenadas para simular movimiento
  const latVariation = (Math.random() - 0.5) * 0.01; // ±0.01 grados
  const lonVariation = (Math.random() - 0.5) * 0.01;
  
  // Obtener patrón actual (DVS y LOG)
  const pattern = MESSAGE_PATTERNS[patternIndex];
  const currentDvs = pattern.dvs;
  const currentLog = pattern.log;
  
  return {
    SNU: snu,
    SID: COOLER_SIDS[snu] || "100", // SID específico por nevera
    TSP: now, // Timestamp actual
    LON: parseFloat((BASE_LON + lonVariation).toFixed(4)),
    LAT: parseFloat((BASE_LAT + latVariation).toFixed(4)),
    ORG: Math.floor(Math.random() * 100), // Origen
    DST: Math.floor(Math.random() * 200), // Destino
    STY: 3, // Tipo de estado
    TMP: parseFloat((20 + Math.random() * 10).toFixed(1)), // Temperatura 20-30°C
    BMV: 8000 + Math.floor(Math.random() * 1000), // Voltaje batería
    BPR: 90 + Math.floor(Math.random() * 10), // Porcentaje batería
    STS: 2500 + Math.floor(Math.random() * 100), // Status
    LOG: currentLog,                 // Log del patrón actual
    SER: {
      MNT: 0,
      MXT: 1,
      STE: 0,
      ORE: 0,
      SHK: 0
    },
    DVS: currentDvs,                 // DVS del patrón actual
    RSS: 10 + Math.floor(Math.random() * 20), // Señal RSS
    BCN: 0,
    VLM: 0,
    ICN: 0,
    NST: parseFloat((20 + Math.random() * 5).toFixed(1)), // Temp mínima
    XST: parseFloat((23 + Math.random() * 5).toFixed(1)), // Temp máxima
    LGC: 525000,
    FWV: "3.0",
    USP: 0
  };
}

// Función para publicar mensaje
function publishMessage(snu) {
  const topic = `cooler_mqtt/ics/${snu}`;
  const payload = generateCoolerData(snu);
  const message = JSON.stringify(payload);
  
  const sendTime = Date.now();
  
  client.publish(topic, message, { qos: 1 }, (err) => {
    if (err) {
      console.error(`❌ Error publicando en ${topic}:`, err.message);
    } else {
      // Con QoS 1, este callback se ejecuta cuando se RECIBE el PUBACK del broker
      const ackTime = Date.now();
      const latency = ackTime - sendTime;
      messageCount++;
      acksReceived++;
      
      const pattern = MESSAGE_PATTERNS[patternIndex];
      console.log(`✅ [${messageCount}/${MESSAGE_PATTERNS.length}] ${new Date().toISOString()} → DVS:${payload.DVS} | LOG:${payload.LOG}`);
      console.log(`   TMP: ${payload.TMP}°C | BAT: ${payload.BPR}% | SID: ${payload.SID} | 📨 ACK recibido en ${latency}ms`);
      
      // Avanzar al siguiente patrón
      patternIndex++;
      
      // Si llegamos al final de los patrones
      if (patternIndex >= MESSAGE_PATTERNS.length) {
        console.log(`\n\n✅✅✅ ¡TODOS LOS ${MESSAGE_PATTERNS.length} MENSAJES COMPLETADOS!`);
        console.log(`📊 ACKs recibidos: ${acksReceived}/${messageCount}\n`);
        cleanup();
      }
    }
  });
}

// Evento: Conexión exitosa
client.on('connect', () => {
  console.log('✅ Conectado al broker MQTT\n');
  
  // Asignar timestamp actual como SID
  const executionTimestamp = Math.floor(Date.now() / 1000);
  COOLER_SIDS['019929bf-ee7f-7d05-a659-3532fe0d8802'] = executionTimestamp.toString();
  console.log(`🔢 SID asignado (timestamp): ${executionTimestamp}`);
  console.log(`📋 Total mensajes a enviar: ${MESSAGE_PATTERNS.length}\n`);
  
  // Publicar mensaje inicial inmediatamente para cada nevera
  COOLERS.forEach(snu => {
    publishMessage(snu);
  });
  
  // Configurar intervalos para cada nevera (1 mensaje cada 1.5 segundos)
  COOLERS.forEach(snu => {
    const intervalId = setInterval(() => {
      publishMessage(snu);
    }, 1500);
    intervalIds.push(intervalId);
  });
  
  console.log('\n🔥 Generador activo! Presiona Ctrl+C para detener.\n');
});

// Evento: Error
client.on('error', (error) => {
  console.error('❌ Error en conexión MQTT:', error.message);
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
  // Limpiar intervalos si se va offline
  intervalIds.forEach(id => clearInterval(id));
  intervalIds = [];
});

// Manejo de señales para cerrar limpiamente
function cleanup() {
  console.log('\n\n👋 Deteniendo generador...');
  console.log(`📊 Total enviados: ${messageCount}`);
  console.log(`📨 ACKs recibidos: ${acksReceived}/${messageCount}`);
  
  if (acksReceived === messageCount) {
    console.log(`✅ Confirmación 100% - Todos los mensajes foram entregados\n`);
  } else {
    console.log(`⚠️  Solo se confirmaron ${acksReceived} de ${messageCount} mensajes\n`);
  }
  
  // Limpiar intervalos
  intervalIds.forEach(id => clearInterval(id));
  intervalIds = [];
  
  // Cerrar conexión MQTT
  client.end(false, () => {
    console.log('✅ Conexión cerrada correctamente');
    process.exit(0);
  });
  
  // Forzar salida después de 2 segundos si no se cierra
  setTimeout(() => {
    process.exit(0);
  }, 2000);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
