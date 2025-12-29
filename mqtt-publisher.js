const mqtt = require('mqtt');

// Configuración del broker MQTT
const MQTT_CONFIG = {
  host: 'ingestapro.thesmartdelivery.com',
  port: 1883,
  username: 'verneAgent',
  password: 'LOIGK3xsdSGLJ',
  clientId: `mqtt_publisher_${Math.random().toString(16).slice(3)}`
};

// SNUs de las neveras (UUIDs)
const COOLERS = [
  '0000010',
];

// Coordenadas base (Granollers, Catalonia)
const BASE_LAT = 42.0714;
const BASE_LON = 2.8155;

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
let intervalIds = [];

// Función para generar datos realistas de nevera
function generateCoolerData(snu) {
  const now = Math.floor(Date.now() / 1000);
  
  // Variar un poco las coordenadas para simular movimiento
  const latVariation = (Math.random() - 0.5) * 0.01; // ±0.01 grados
  const lonVariation = (Math.random() - 0.5) * 0.01;
  
  return {
    SNU: snu,
    SID: now - 7200, // Session ID (hace 2 horas)
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
    LOG: 1, // Como solicitaste
    SER: {
      MNT: 0,
      MXT: 1,
      STE: 0,
      ORE: 0,
      SHK: 0
    },
    DVS: 1, // Como solicitaste
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
  
  client.publish(topic, message, { qos: 0 }, (err) => {
    if (err) {
      console.error(`❌ Error publicando en ${topic}:`, err.message);
    } else {
      messageCount++;
      console.log(`✅ [${messageCount}] ${new Date().toISOString()} → ${topic.substring(0, 40)}...`);
      console.log(`   TMP: ${payload.TMP}°C | BAT: ${payload.BPR}% | LAT: ${payload.LAT} | LON: ${payload.LON}`);
    }
  });
}

// Evento: Conexión exitosa
client.on('connect', () => {
  console.log('✅ Conectado al broker MQTT\n');
  console.log(`📦 Enviando mensajes a ${COOLERS.length} neveras cada 1 segundo...`);
  console.log(`🎯 Topics: cooler_mqtt/ics/[UUID]\n`);
  
  // Publicar mensaje inicial inmediatamente para cada nevera
  COOLERS.forEach(snu => {
    publishMessage(snu);
  });
  
  // Configurar intervalos para cada nevera (1 mensaje por segundo)
  COOLERS.forEach(snu => {
    const intervalId = setInterval(() => {
      publishMessage(snu);
    }, 2000);
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
  console.log(`📊 Total de mensajes enviados: ${messageCount}`);
  
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
