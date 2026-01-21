# 🌐 MQTT Explorer - Sistema de Monitoreo de Neveras Inteligentes

**Desarrollado por:** ehernandez@labelgrup.com  
**Proyecto:** SZENDEX - Sistema de Análisis de Telemetría de Coolers

---

## 🎯 ¿Qué es este proyecto?

MQTT Explorer es un sistema completo para **monitorear, capturar y analizar** mensajes telemétricos de neveras inteligentes conectadas a través del protocolo MQTT. Este proyecto está íntimamente vinculado al **proyecto SZENDEX**, donde se requiere un análisis exhaustivo de los datos de envío y comunicación de las neveras para optimizar la cadena de suministro y detectar anomalías en tiempo real.

### 🔗 Conexión con SZENDEX
SZENDEX es nuestro sistema principal de gestión de logística inteligente para neveras. Este MQTT Explorer actúa como el **cerebro de monitoreo** que:
- Captura todos los mensajes de telemetría de las neveras
- Detecta gaps o interrupciones en las comunicaciones
- Proporciona análisis detallados de patrones de conectividad
- Genera reportes para optimizar las rutas y detectar problemas de conectividad

---

## 🏗️ Arquitectura del Sistema

El proyecto consta de **3 componentes principales independientes**:

```
📡 MQTT Broker (ingestaprod.thesmartdelivery.com:1883)
    │
    ├─ Topic: cooler_mqtt/ics/#
    │
    ┌─────────────────────┬─────────────────────┬─────────────────────┐
    ▼                     ▼                     ▼                     ▼
🎧 LISTENER          📊 ANALIZADORES      🔄 PUBLISHER       📋 LOGS
mqtt-listener.js     search-logs.js      mqtt-publisher.js   logs/*.txt
                     check-service-gaps.js                    (100MB/archivo)
                     report-all-gaps.js
                     export-gaps-report.js
```

### 1. 🎧 **LISTENER** (Monitoreo Pasivo)
- **Archivo:** `mqtt-listener.js`
- **Función:** Escucha y guarda **TODOS** los mensajes MQTT que llegan
- **Almacenamiento:** Archivos de log rotatorios (100MB máximo por archivo)
- **Persistencia:** `logs/mqtt_messages_YYYY-MM-DD_N.txt`
- **Reconexión:** Automática cada 5 segundos si se pierde conexión

### 2. 📊 **ANALIZADORES** (Scripts de Análisis)
- **search-logs.js**: Búsqueda avanzada por SID/SNU/TSP/LOG/DVS
- **check-service-gaps.js**: Análisis de gaps temporales para un SID específico
- **report-all-gaps.js**: Reporte global de gaps de todos los SIDs
- **export-gaps-report.js**: Exportador de reportes a CSV

### 3. 🔄 **PUBLISHER** (Generador de Pruebas)
- **Archivo:** `mqtt-publisher.js`
- **Función:** Genera datos FALSOS para testing y desarrollo
- **⚠️ CUIDADO:** Solo usar en entorno de desarrollo/testing

---

## 🚀 Instalación y Configuración

### Paso 1: Instalar dependencias
```bash
npm install
```

### Paso 2: Configurar variables de entorno
Crea un archivo `.env` en la raíz del proyecto:

```bash
# Credenciales MQTT (OBLIGATORIAS)
MQTT_HOST=ingestaprod.thesmartdelivery.com
MQTT_PORT=1883
MQTT_USERNAME=tu_usuario_mqtt
MQTT_PASSWORD=tu_contraseña_mqtt
```

**🔒 IMPORTANTE:** 
- Nunca subas el archivo `.env` a Git
- Usa `.env.example` como plantilla
- Todas las credenciales DEBEN estar en variables de entorno

### Paso 3: Verificar configuración
```bash
# Verificar que las variables están cargadas
node -e "require('dotenv').config(); console.log('Host:', process.env.MQTT_HOST);"
```

---

## 📖 Guía de Uso Rápida

### 🎧 1. Escuchar mensajes en tiempo real
```bash
# Inicia el listener (se queda ejecutando indefinidamente)
npm run listener

# Verás mensajes como:
# ⏰ Timestamp: 2026-01-21 14:30:45.123
# 📍 Topic: cooler_mqtt/ics/019929c1-7ec6-7ae3-b456-a037c249c446
# 📦 Mensaje: {"SNU": "019929c1...", "TMP": 23.5, ...}
```

**¿Qué hace?** Captura TODOS los mensajes de todas las neveras y los guarda en archivos de log.

### 🔍 2. Buscar mensajes específicos
```bash
# Buscar mensajes de una nevera específica (por SID)
npm run search -- --sid=1768468839

# Buscar mensajes con errores (LOG diferente de 1)
npm run search -- --log=44

# Buscar mensajes de un dispositivo específico (DVS)
npm run search -- --dvs=6

# Combinar filtros
npm run search -- --sid=1768468839 --dvs=6 --log=1
```

**¿Qué hace?** Te permite encontrar mensajes específicos sin revisar manualmente miles de líneas.

### 📊 3. Detectar problemas de conectividad
```bash
# Analizar gaps de una nevera específica (gaps > 5 minutos)
npm run check-gaps -- --sid=1768468839 --gap=5

# Reporte global de TODAS las neveras (gaps > 4 minutos)
npm run report-gaps -- --gap=4

# Exportar reporte de gaps a CSV
npm run export-gaps
```

**¿Qué hace?** Detecta cuándo una nevera deja de enviar mensajes (posibles problemas de conectividad, batería, etc.).

### 🔄 4. Generar datos de prueba (SOLO DESARROLLO)
```bash
# ⚠️ CUIDADO: Solo usar en desarrollo/testing
npm run publish
```

**⚠️ ADVERTENCIA:** Este comando genera datos FALSOS en el sistema de producción. Solo usar para pruebas.

---

## 🛠️ Comandos Disponibles

| Comando | Descripción | Uso |
|---------|-------------|-----|
| `npm run listener` | Escucha mensajes MQTT | Producción |
| `npm run search` | Buscar en logs | Análisis |
| `npm run check-gaps` | Gaps de un SID | Diagnóstico |
| `npm run report-gaps` | Reporte global gaps | Monitoreo |
| `npm run export-gaps` | Exportar a CSV | Reportes |
| `npm run publish` | ⚠️ Datos falsos | Solo testing |

---

## 📊 Estructura de Datos

### Formato de mensajes MQTT
```json
{
  "SNU": "019929c1-7ec6-7ae3-b456-a037c249c446", // UUID único del dispositivo
  "SID": 1768468839,                              // Service ID 
  "TSP": 1768998945,                              // Timestamp del mensaje
  "TMP": 23.5,                                    // Temperatura actual
  "LAT": 42.071, "LON": 2.815,                   // Coordenadas GPS
  "BMV": 7543, "BPR": 52,                        // Batería (voltaje y porcentaje)
  "LOG": 1,                                       // Estado de logging (1=OK, >1=Error)
  "DVS": 6,                                       // Estado del dispositivo
  "RSS": 28,                                      // Señal de red
  // ... más campos técnicos
}
```

### Campos clave para análisis:
- **SNU**: Identificador único de la nevera
- **SID**: ID de servicio (agrupa múltiples neveras)
- **LOG**: Estado (1=normal, >1=problema)
- **DVS**: Estado del dispositivo
- **TMP**: Temperatura crítica para cadena de frío

---

## 📁 Archivos y Estructura

```
mqtt-explorer/
├── 📄 mqtt-listener.js          # Listener principal (244 líneas)
├── 📄 mqtt-publisher.js         # Generador pruebas (166 líneas)
├── 📄 search-logs.js            # Buscador avanzado (172 líneas)
├── 📄 check-service-gaps.js     # Análisis gaps por SID (193 líneas)
├── 📄 report-all-gaps.js        # Reporte global (238 líneas)
├── 📄 export-gaps-report.js     # Exportador CSV
├── 📂 logs/                     # Archivos de log (rotación 100MB)
├── 📄 .env                      # Credenciales (NO subir a Git)
├── 📄 .env.example             # Plantilla de configuración
└── 📄 gaps_report.txt          # Último reporte generado
```

---

## 🔧 Troubleshooting

### Problema: "Error de conexión MQTT"
**Solución:**
1. Verificar que `.env` existe y tiene las credenciales correctas
2. Comprobar conectividad: `ping ingestaprod.thesmartdelivery.com`
3. Verificar puerto: `telnet ingestaprod.thesmartdelivery.com 1883`

### Problema: "No se guardan los logs"
**Solución:**
1. Verificar permisos de escritura en carpeta `logs/`
2. Comprobar espacio en disco
3. Revisar que el listener esté recibiendo mensajes

### Problema: "No encuentro mensajes con search"
**Solución:**
1. Verificar que hay archivos en `logs/`
2. Usar filtros menos restrictivos
3. Comprobar formato de fecha en logs

---

## 🔐 Seguridad

- ✅ Todas las credenciales en `.env`
- ✅ `.env` excluido de Git
- ✅ Logs incluidos en repositorio (para análisis histórico)
- ⚠️ Publisher genera datos falsos - NO usar en producción

---

## 🚀 Roadmap y Extensiones

### Posibles mejoras:
- **Filtrado MQTT**: Regex en suscripción a topics específicos
- **Compresión**: Gzip automático para archivos >100MB
- **Base de datos**: SQLite/PostgreSQL para análisis más complejos
- **Dashboard**: Interfaz web para monitoreo en tiempo real
- **Alertas**: Notificaciones automáticas por gaps críticos

---

## 📞 Soporte

**Desarrollador:** ehernandez@labelgrup.com  
**Proyecto:** SZENDEX  
**Repositorio:** Interno Labelgrup

---

## 📝 Notas Técnicas

- **Node.js**: ≥14.0
- **Dependencias**: `mqtt@^5.3.4`, `dotenv@^17.2.3`
- **Rotación logs**: 100MB por archivo
- **Timestamps**: Hora local (NO UTC)
- **Reconexión**: Automática cada 5 segundos
- **Topic MQTT**: `cooler_mqtt/ics/#`

---

*Este sistema es fundamental para el correcto funcionamiento del proyecto SZENDEX, proporcionando visibilidad completa sobre el estado de conectividad y salud de las neveras inteligentes.*
# szendex-mqtt-explorer
# szendex-mqtt-explorer
