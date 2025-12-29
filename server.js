const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mqtt = require('mqtt');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Configuración
const PORT = 3000;
const MQTT_CONFIG = {
  host: 'ingestaprod.thesmartdelivery.com',
  port: 1883,
  username: 'verneAgent',
  password: 'LOIGK3xsdSGLJ',
  clientId: `mqtt_dashboard_${Math.random().toString(16).slice(3)}`
};

// Servir archivos estáticos
app.use(express.static('public'));

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Estadísticas en memoria
let stats = {
  totalMessages: 0,
  messagesPerCooler: {},
  lastUpdate: new Date().toISOString(),
  connectedClients: 0
};

console.log('🚀 Iniciando servidor web y cliente MQTT...');

// Conectar a MQTT
const mqttClient = mqtt.connect(`mqtt://${MQTT_CONFIG.host}:${MQTT_CONFIG.port}`, {
  username: MQTT_CONFIG.username,
  password: MQTT_CONFIG.password,
  clientId: MQTT_CONFIG.clientId,
  clean: true,
  reconnectPeriod: 5000
});

mqttClient.on('connect', () => {
  console.log('✅ Conectado al broker MQTT');
  mqttClient.subscribe('cooler_mqtt/ics/#', (err) => {
    if (err) {
      console.error('❌ Error al suscribirse:', err.message);
    } else {
      console.log('📬 Suscrito a: cooler_mqtt/ics/#');
    }
  });
});

mqttClient.on('message', (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    const timestamp = new Date().toISOString();
    
    // Actualizar estadísticas
    stats.totalMessages++;
    stats.lastUpdate = timestamp;
    
    if (payload.SNU) {
      if (!stats.messagesPerCooler[payload.SNU]) {
        stats.messagesPerCooler[payload.SNU] = 0;
      }
      stats.messagesPerCooler[payload.SNU]++;
    }
    
    // Enviar a todos los clientes conectados
    io.emit('mqtt-message', {
      topic,
      payload,
      timestamp
    });
    
    // Log en consola
    console.log(`📦 [${stats.totalMessages}] ${topic} - TMP: ${payload.TMP}°C`);
    
  } catch (error) {
    console.error('❌ Error procesando mensaje:', error.message);
  }
});

mqttClient.on('error', (error) => {
  console.error('❌ Error MQTT:', error.message);
});

mqttClient.on('reconnect', () => {
  console.log('🔄 Reconectando a MQTT...');
});

// WebSocket - conexión de clientes
io.on('connection', (socket) => {
  stats.connectedClients++;
  console.log(`👤 Cliente conectado (Total: ${stats.connectedClients})`);
  
  // Enviar estadísticas actuales al nuevo cliente
  socket.emit('stats', stats);
  
  socket.on('disconnect', () => {
    stats.connectedClients--;
    console.log(`👋 Cliente desconectado (Total: ${stats.connectedClients})`);
  });
  
  // Solicitud de estadísticas
  socket.on('request-stats', () => {
    socket.emit('stats', stats);
  });
});

// Enviar estadísticas cada 5 segundos
setInterval(() => {
  io.emit('stats', stats);
}, 5000);

// Iniciar servidor
server.listen(PORT, () => {
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('🌐 Dashboard Web MQTT Cooler');
  console.log('═══════════════════════════════════════════');
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`📡 MQTT: ${MQTT_CONFIG.host}:${MQTT_CONFIG.port}`);
  console.log(`📬 Topic: cooler_mqtt/ics/#`);
  console.log('═══════════════════════════════════════════');
  console.log('');
  console.log('🔥 Servidor listo! Abre el navegador en http://localhost:3000');
  console.log('');
});

// Manejo de cierre limpio
process.on('SIGINT', () => {
  console.log('\n\n👋 Cerrando servidor...');
  mqttClient.end();
  server.close(() => {
    console.log('✅ Servidor cerrado');
    process.exit(0);
  });
});