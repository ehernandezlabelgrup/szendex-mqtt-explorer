# MQTT Explorer - Instrucciones para AI Agents

Sistema de monitoreo, análisis y exportación de mensajes MQTT para neveras inteligentes (coolers).

## Arquitectura del Sistema

### Componentes Principales (3 modos independientes)

1. **Listener Standalone** (`mqtt-listener.js`)
   - Monitoreo pasivo con persistencia en disco
   - Rotación automática de logs (100MB por archivo)
   - Timestamps en hora local (no UTC)
   - Reconexión automática en caso de fallo

2. **Dashboard Web** (`server.js` + `public/index.html`)
   - Express + Socket.io para real-time
   - Estadísticas en memoria (no persiste entre reinicios)
   - Puerto 3000 por defecto
   - También se conecta a MQTT y escucha mensajes

3. **Exportadores CSV** (Python y Node.js)
   - Procesan logs de texto plano en `logs/`
   - **Corrección automática timezone: UTC → UTC+1**
   - Aplanamiento de JSON anidado (30+ columnas)
   - Salida compatible con Excel

### Flujo de Datos

```
MQTT Broker (ingestaprod.thesmartdelivery.com:1883)
    ↓ Topic: cooler_mqtt/ics/#
    ├─→ mqtt-listener.js → logs/mqtt_messages_YYYY-MM-DD_N.txt
    └─→ server.js → WebSocket → Browser Dashboard
         ↓
    logs/*.txt → export-csv.js/export_to_csv.py → CSV files
```

## Convenciones del Proyecto

### Configuración MQTT (hardcoded en todos los archivos)

```javascript
const MQTT_CONFIG = {
  host: 'ingestaprod.thesmartdelivery.com',
  port: 1883,
  username: 'verneAgent',
  password: 'LOIGK3xsdSGLJ',
  clientId: `mqtt_<componente>_${Math.random().toString(16).slice(3)}`
};
```

**Importante**: Cada script genera su propio `clientId` aleatorio para evitar colisiones.

### Formato de Logs

Los archivos en `logs/` siguen este formato:

```
[YYYY-MM-DD HH:mm:ss.SSS] cooler_mqtt/ics/<uuid>
{"SNU": "...", "TMP": 23.5, "LAT": 42.071, ...}
================================================================================
```

- Timestamps en hora local (no UTC)
- Separadores de 80 caracteres (`=`)
- JSON en línea única (sin formateo)

### Rotación de Archivos

```javascript
// mqtt-listener.js
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
// Patrón: mqtt_messages_2025-12-29_1.txt
//         mqtt_messages_2025-12-29_2.txt (al superar 100MB)
```

Cuando `_1.txt` supera 100MB, se crea automáticamente `_2.txt`.

## Comandos NPM Esenciales

```bash
npm run listener   # Monitoreo + guardado (bloqueante)
npm run dashboard  # Web UI en :3000 (bloqueante)
npm run publish    # Generador de datos de prueba (bloqueante)
npm run export     # CSV con Python
npm run export-js  # CSV con Node.js (preferido)
```

**Nota**: No hay comandos de build/test/lint configurados.

## Patrones Específicos del Proyecto

### 1. Manejo de Timestamps

**Regla**: Siempre convertir UTC+1 al exportar, nunca al recibir.

```javascript
// CORRECTO (en mqtt-listener.js): guardar con hora local
function getLocalTimestamp() {
  const now = new Date();
  // Formateo manual con padStart, NO usar toISOString()
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

// CORRECTO (en export-csv.js): ajustar +1 hora para Excel
function adjustTimestampToLocal(timestamp) {
  date.setTime(date.getTime() + (60 * 60 * 1000)); // +1 hora
  return date.toISOString().slice(0, 19).replace('T', ' ');
}
```

### 2. Parsing de Logs

Los exportadores usan **regex para extraer JSON**, no parseo línea a línea:

```javascript
// export-csv.js
const match = line.match(/\{.*\}/);
if (match) {
  const jsonData = JSON.parse(match[0]);
}
```

### 3. Aplanamiento de Datos Anidados

```javascript
// export-csv.js: flattenJsonData()
// Convierte {"SER": {"DEL": 123}} → {"SER_DEL": 123}
// Arrays se convierten a JSON string
```

### 4. Socket.io en Dashboard

```javascript
// server.js
io.emit('mqtt-message', { topic, payload, timestamp });
io.emit('stats', stats); // Cada 5 segundos

// index.html
socket.on('mqtt-message', (data) => { /* actualizar UI */ });
```

## Debugging y Troubleshooting

### Verificar Conectividad MQTT

```bash
# Si falla la conexión, verificar:
ping ingestaprod.thesmartdelivery.com
telnet ingestaprod.thesmartdelivery.com 1883
```

### Inspeccionar Logs Guardados

```bash
# Ver últimos mensajes
tail -f logs/mqtt_messages_$(date +%Y-%m-%d)_1.txt

# Contar mensajes del día
grep -c "^\[" logs/mqtt_messages_$(date +%Y-%m-%d)_1.txt
```

### Puerto 3000 Ocupado

```bash
# Cambiar PORT en server.js línea 12
const PORT = 3000; // Modificar a otro valor
```

## Dependencias Críticas

```json
{
  "mqtt": "^5.3.4",        // Cliente MQTT
  "express": "^4.18.2",    // Servidor web
  "socket.io": "^4.6.1"    // WebSocket real-time
}
```

No hay dependencias de desarrollo (no TypeScript, no tests).

## Extensiones Futuras

Si se requiere modificar/extender:

- **Añadir autenticación al dashboard**: Usar Express middleware
- **Persistencia de estadísticas**: Usar base de datos (actualmente solo en memoria)
- **Filtrado de mensajes**: Añadir regex en subscripción MQTT
- **Exportación automática**: Usar cron + `export-csv.js`

## Anti-Patrones Actuales (documentados, no bugs)

1. **Credenciales hardcoded**: No usar variables de entorno
2. **Sin manejo de errores robusto**: Logs básicos con `console.error`
3. **Stats en memoria**: Se pierden al reiniciar `server.js`
4. **No hay validación de esquema**: JSON se acepta tal cual
5. **Dual exportador**: Python y Node.js hacen lo mismo

Estas son decisiones del proyecto actual, no errores a corregir.
