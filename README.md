# 🚀 MQTT Explorer - Sistema Completo de Monitoreo

Sistema integral para monitoreo, análisis y exportación de mensajes MQTT de neveras inteligentes.

## ✨ Características Principales

- 📡 **Listener MQTT**: Escucha y guarda mensajes automáticamente
- 🌐 **Dashboard Web**: Visualización en tiempo real 
- 📊 **Exportación CSV**: Dos exportadores (Python + Node.js)
- ⏰ **Corrección de Timezone**: Automática para Excel (UTC+1)
- 📁 **Persistencia**: Guardado automático en archivos
- 📤 **Publicador**: Generador de mensajes de prueba

## 📋 Requisitos

- Node.js (versión 14 o superior)
- Python 3.x (para exportador Python)
- npm

## 🚀 Instalación Rápida

```bash
# Instalar dependencias
npm install

# Verificar Python (opcional, solo para export Python)
python3 --version
```

## 🎛️ Comandos Disponibles

### 1. � Listener MQTT (Monitoreo + Guardado)

```bash
npm run listener
```

**¿Qué hace?**
- ✅ Escucha mensajes del topic `cooler_mqtt/ics/#`
- ✅ **Guarda automáticamente** en `logs/mqtt_messages_YYYY-MM-DD.txt`
- ✅ Muestra mensajes en consola en tiempo real
- ✅ Reconexión automática si se pierde conexión

**Salida típica:**
```
✅ Conectado al broker MQTT
� Archivo de log: logs/mqtt_messages_2025-11-05.txt
�📬 Suscrito a: cooler_mqtt/ics/#
👂 Escuchando y guardando mensajes...

─────────────────────────────────────────
⏰ Timestamp: 2025-11-05T17:50:55.000Z
📍 Topic: cooler_mqtt/ics/cd6d94c0-bc99-44f6-99da-e6b23fc9aaea
� Guardado en logs/
�📦 Mensaje: {"SNU": "cd6d94c0...", "TMP": 23.5, ...}
─────────────────────────────────────────
```

### 2. 🌐 Dashboard Web (Visualización)

```bash
npm run dashboard
```

**¿Qué incluye?**
- ✅ Interfaz web en **http://localhost:3000**
- ✅ **Actualización en tiempo real** (Socket.io)
- ✅ Contador de mensajes recibidos
- ✅ Último mensaje con formato JSON
- ✅ **También guarda** mensajes en logs/

**Características del Dashboard:**
- 📊 Estadísticas en vivo
- 🎨 Interfaz limpia y responsive
- 📡 Indicador de conexión MQTT
- ⏱️ Timestamps actualizados

### 3. 📊 Exportación a CSV

#### Opción A: Exportador Python (Recomendado)
```bash
npm run export
```

#### Opción B: Exportador Node.js (Nativo)
```bash
npm run export-js
```

**Ambos exportadores incluyen:**
- ✅ Conversión de logs a CSV para Excel
- ✅ **Corrección automática de timezone** (UTC+1)
- ✅ Organización inteligente de columnas (30+ campos)
- ✅ Manejo de datos JSON anidados
- ✅ Estadísticas detalladas del proceso

**Salida típica:**
```
🚀 Iniciando exportación CSV...
📂 Procesando: mqtt_messages_2025-11-05.txt
📊 Total de mensajes encontrados: 10,566
💾 Creando archivo: mqtt_messages_2025-11-05_export_20251106.csv

✅ Exportación completada!
📊 Estadísticas:
   • Total mensajes: 10,566
   • Tamaño archivo: 2,345 KB  
   • Columnas: 30
   • Primer mensaje: 2025-11-05 19:30:42
   • Último mensaje: 2025-11-05 23:45:12

🎯 Listo para abrir en Excel!
```

### 4. 📤 Publicador de Pruebas (Opcional)

```bash
npm run publish
```

**Para generar tráfico de prueba:**
- ✅ Publica mensajes cada **1 segundo** para cada nevera
- ✅ Simula 3 neveras diferentes
- ✅ Datos realistas (temperatura, GPS, batería)
- ✅ Perfect para pruebas del listener y dashboard

## 🔄 Flujos de Trabajo Típicos

### 🎯 **Flujo Básico - Monitoreo y Análisis**
```bash
# 1. Iniciar monitoreo (en background)
npm run listener &

# 2. Ver dashboard en navegador
npm run dashboard
# Abrir: http://localhost:3000

# 3. Después de un tiempo, exportar datos
npm run export-js
```

### 🧪 **Flujo de Pruebas Completas**
```bash
# Terminal 1: Monitoreo
npm run listener

# Terminal 2: Dashboard  
npm run dashboard

# Terminal 3: Generar tráfico de prueba
npm run publish

# Terminal 4: Exportar cuando desees
npm run export
```

### 📊 **Solo Análisis de Datos Existentes**
```bash
# Si ya tienes logs guardados
npm run export        # Exportador Python
# o
npm run export-js     # Exportador Node.js
```

## � Estructura del Proyecto

```
mqtt-exporer/
├── 📄 mqtt-listener.js      # Listener principal con guardado
├── 🌐 server.js             # Servidor web + dashboard
├── 📤 mqtt-publisher.js     # Generador de mensajes de prueba  
├── 📊 export_to_csv.py      # Exportador CSV (Python)
├── 📊 export-csv.js         # Exportador CSV (Node.js)
├── 📋 package.json          # Configuración y scripts
├── 🎨 public/
│   └── index.html          # Dashboard web
└── 📁 logs/                # Mensajes guardados automáticamente
    └── mqtt_messages_YYYY-MM-DD.txt
```

## ⚙️ Configuración Técnica

### Conexión MQTT:
- **Broker**: `ingestaprod.thesmartdelivery.com:1883`
- **Credenciales**: `verneAgent / LOIGK3xsdSGLJ`
- **Topic**: `cooler_mqtt/ics/#` (escucha todos)
- **QoS**: 0 (Fire and forget)

### Archivos Generados:
- **Logs**: `logs/mqtt_messages_YYYY-MM-DD.txt`
- **CSV**: `mqtt_messages_YYYY-MM-DD_export_TIMESTAMP.csv`
- **Formato**: Separadores `─────────` entre mensajes
- **Timezone**: UTC+1 en exportaciones (ideal para España)

## 📊 Exportación CSV - Detalles

### 🐍 Exportador Python vs 🟨 Node.js

| Característica | Python (`export`) | Node.js (`export-js`) |
|---------------|-------------------|----------------------|
| **Dependencias** | Python 3.x | Solo Node.js |
| **Velocidad** | Muy rápida | Rápida |
| **Librerías** | csv, json nativo | Built-in Node.js |
| **Mantenimiento** | Menos integrado | Totalmente integrado |

**Recomendación**: Usar Node.js (`npm run export-js`) para mayor simplicidad.

### 📋 Columnas del CSV (30 campos)

El CSV organiza automáticamente **30 columnas** incluyendo:

| Grupo | Campos | Descripción |
|--------|---------|-------------|
| **🕒 Tiempo** | `timestamp`, `timestamp_original` | Hora local (UTC+1) y UTC original |
| **📍 Ubicación** | `LAT`, `LON`, `ORG`, `DST` | GPS y distancias |
| **🌡️ Sensores** | `TMP`, `NST`, `XST` | Temperaturas |
| **🔋 Energía** | `BMV`, `BPR` | Voltaje y porcentaje batería |
| **📡 Conectividad** | `RSS`, `BCN`, `DVS` | Señal y conectividad |
| **🔧 Sistema** | `STS`, `FWV`, `SER_*` | Estado y firmware |
| **🆔 Identificación** | `SNU`, `SID`, `TSP` | IDs únicos |

### ⏰ Corrección Automática de Timezone

```
Original (UTC):     2025-11-05T18:30:42.766Z
Exportado (UTC+1):  2025-11-05 19:30:42
```

**Perfecto para España** - Se añade automáticamente 1 hora.

## � Solución de Problemas

### ❌ **Error: "Cannot connect to MQTT broker"**
```bash
# Verificar conectividad
ping ingestaprod.thesmartdelivery.com

# Revisar credenciales en mqtt-listener.js
```

### ❌ **No se crean archivos de log**
```bash
# Verificar permisos de escritura
ls -la logs/

# Crear directorio manualmente si no existe
mkdir logs
```

### ❌ **CSV vacío o sin datos**
```bash
# Verificar que existe el archivo de log
ls -la logs/mqtt_messages_*.txt

# Ejecutar listener primero para generar datos
npm run listener
```

### ❌ **Dashboard no carga (localhost:3000)**
```bash
# Verificar que el puerto no esté ocupado
lsof -i :3000

# Cambiar puerto en server.js si es necesario
```

## 🎯 Casos de Uso Reales

### 📈 **Análisis de Rendimiento**
1. Ejecutar `npm run listener` durante varias horas
2. Exportar con `npm run export-js`
3. Analizar en Excel: temperaturas, batería, conectividad

### 🔍 **Monitoreo en Tiempo Real**
1. Abrir dashboard: `npm run dashboard`
2. Navegar a `http://localhost:3000`
3. Ver mensajes llegando en vivo

### 🧪 **Desarrollo y Pruebas**
1. Generar datos: `npm run publish`
2. Monitorear: `npm run listener` 
3. Verificar en dashboard y exportar

### 📊 **Reportes Periódicos**
1. Configurar listener como servicio
2. Script automático de exportación diaria
3. Análisis de tendencias en Excel

## 🔄 Scripts Disponibles

```bash
npm run listener    # 📡 Monitoreo + guardado automático
npm run dashboard   # 🌐 Interfaz web (localhost:3000)
npm run publish     # 📤 Generador de mensajes de prueba
npm run export      # 🐍 Exportador CSV (Python)
npm run export-js   # 🟨 Exportador CSV (Node.js)
```

## � Soporte

- **Logs**: Revisar archivos en `logs/`
- **Dashboard**: http://localhost:3000 para diagnóstico visual
- **Configuración**: Todos los parámetros en archivos .js
- **Exportación**: Ambas versiones (Python/Node.js) generan el mismo resultado

---

## 🏆 **Quick Start - 3 Pasos**

```bash
# 1️⃣ Instalar
npm install

# 2️⃣ Monitorear 
npm run listener

# 3️⃣ Analizar (en otra terminal)
npm run export-js
```

**¡Listo!** Ya tienes logs guardándose y CSV para Excel con timezone correcto. 🎉
