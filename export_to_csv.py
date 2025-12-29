#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script para exportar mensajes MQTT desde logs a CSV para Excel
Extrae todos los campos del JSON y los organiza en columnas
"""

import json
import csv
import re
import os
from datetime import datetime, timezone, timedelta
import sys

def adjust_timestamp_to_local(timestamp_str, hours_offset=1):
    """
    Convierte timestamp UTC a hora local sumando las horas especificadas
    """
    try:
        # Parsear el timestamp UTC
        if timestamp_str.endswith('Z'):
            # Formato ISO con Z (UTC)
            dt_utc = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
        else:
            # Asumir que es UTC si no tiene zona horaria
            dt_utc = datetime.fromisoformat(timestamp_str)
            dt_utc = dt_utc.replace(tzinfo=timezone.utc)
        
        # Sumar las horas especificadas
        dt_local = dt_utc + timedelta(hours=hours_offset)
        
        # Devolver en formato legible para Excel (sin zona horaria)
        return dt_local.strftime('%Y-%m-%d %H:%M:%S')
    except Exception as e:
        print(f"⚠️  Error ajustando timestamp '{timestamp_str}': {e}")
        return timestamp_str

def parse_log_file(log_file_path):
    """
    Lee el archivo de log y extrae todos los mensajes MQTT
    """
    messages = []
    current_message = {}
    
    print(f"📖 Leyendo archivo: {log_file_path}")
    
    with open(log_file_path, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            
            # Detectar línea de timestamp y topic
            if line.startswith('[') and '] cooler_mqtt/' in line:
                # Extraer timestamp y topic
                match = re.match(r'\[([^\]]+)\] (.+)', line)
                if match:
                    timestamp_str = match.group(1)
                    topic = match.group(2)
                    
                    # Ajustar timestamp a hora local (UTC+1)
                    local_timestamp = adjust_timestamp_to_local(timestamp_str, hours_offset=1)
                    
                    current_message = {
                        'timestamp': local_timestamp,
                        'timestamp_original': timestamp_str,
                        'topic': topic,
                        'line_number': line_num
                    }
            
            # Detectar línea JSON
            elif line.startswith('{') and line.endswith('}'):
                try:
                    json_data = json.loads(line)
                    if current_message:
                        current_message['json_data'] = json_data
                        messages.append(current_message.copy())
                        current_message = {}
                except json.JSONDecodeError:
                    print(f"⚠️  Error JSON en línea {line_num}: {line[:50]}...")
                    continue
    
    print(f"✅ Encontrados {len(messages)} mensajes válidos")
    print(f"🕐 Timestamps ajustados a UTC+1 (hora local)")
    return messages

def flatten_json_data(json_data):
    """
    Aplana el JSON anidado para crear columnas separadas
    """
    flattened = {}
    
    for key, value in json_data.items():
        if isinstance(value, dict):
            # Para objetos anidados como SER
            for sub_key, sub_value in value.items():
                flattened[f"{key}_{sub_key}"] = sub_value
        else:
            flattened[key] = value
    
    return flattened

def export_to_csv(messages, output_file):
    """
    Exporta los mensajes a CSV con todas las columnas
    """
    if not messages:
        print("❌ No hay mensajes para exportar")
        return
    
    # Recopilar todas las columnas posibles de los datos
    data_columns = set()
    
    for msg in messages:
        if 'json_data' in msg:
            flattened = flatten_json_data(msg['json_data'])
            data_columns.update(flattened.keys())
    
    # Construir orden específico de columnas:
    # 1. timestamp (hora local UTC+1)
    # 2. SNU (identificador de nevera) 
    # 3. timestamp_original (hora UTC original)
    # 4. Resto de campos ordenados alfabéticamente
    
    final_columns = ['timestamp']
    
    # Añadir SNU en segunda posición si existe
    if 'SNU' in data_columns:
        final_columns.append('SNU')
        data_columns.remove('SNU')
    
    # Añadir timestamp original en tercera posición
    final_columns.append('timestamp_original')
    
    # Añadir resto de campos ordenados alfabéticamente
    remaining_columns = sorted(list(data_columns))
    final_columns.extend(remaining_columns)
    
    print(f"📊 Exportando {len(messages)} mensajes con {len(final_columns)} columnas")
    print(f"💾 Archivo destino: {output_file}")
    
    # Escribir CSV
    with open(output_file, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=final_columns)
        
        # Escribir encabezados
        writer.writeheader()
        
        # Escribir datos
        for msg in messages:
            row = {
                'timestamp': msg.get('timestamp', ''),
                'timestamp_original': msg.get('timestamp_original', ''),
                'topic': msg.get('topic', ''),
                'line_number': msg.get('line_number', '')
            }
            
            if 'json_data' in msg:
                flattened = flatten_json_data(msg['json_data'])
                row.update(flattened)
            
            writer.writerow(row)
    
    print(f"✅ Exportación completada!")
    print(f"📋 Columnas incluidas:")
    for i, col in enumerate(final_columns, 1):
        print(f"   {i:2d}. {col}")

def main():
    # Configurar rutas
    script_dir = os.path.dirname(os.path.abspath(__file__))
    logs_dir = os.path.join(script_dir, 'logs')
    
    # Buscar archivos de log
    log_files = []
    if os.path.exists(logs_dir):
        for file in os.listdir(logs_dir):
            if file.startswith('mqtt_messages_') and file.endswith('.txt'):
                log_files.append(os.path.join(logs_dir, file))
    
    if not log_files:
        print("❌ No se encontraron archivos de log en:", logs_dir)
        return
    
    # Mostrar archivos disponibles
    print("📁 Archivos de log encontrados:")
    for i, log_file in enumerate(log_files, 1):
        size_mb = os.path.getsize(log_file) / (1024 * 1024)
        print(f"   {i}. {os.path.basename(log_file)} ({size_mb:.1f} MB)")
    
    # Seleccionar archivo (usar el más reciente por defecto)
    if len(log_files) == 1:
        selected_file = log_files[0]
        print(f"\n🎯 Procesando: {os.path.basename(selected_file)}")
    else:
        # Tomar el más reciente
        selected_file = max(log_files, key=os.path.getmtime)
        print(f"\n🎯 Procesando el más reciente: {os.path.basename(selected_file)}")
    
    # Procesar archivo
    messages = parse_log_file(selected_file)
    
    if messages:
        # Generar nombre de archivo CSV
        base_name = os.path.basename(selected_file).replace('.txt', '')
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_file = os.path.join(script_dir, f"{base_name}_export_{timestamp}.csv")
        
        # Exportar
        export_to_csv(messages, output_file)
        
        print(f"\n🎉 ¡Listo! Archivo CSV creado:")
        print(f"📁 {output_file}")
        print(f"\n💡 Puedes abrir este archivo directamente en Excel")
        print(f"💡 Las columnas están organizadas por importancia")
        
        # Mostrar estadísticas
        if messages:
            first_msg = messages[0]
            last_msg = messages[-1]
            print(f"\n📊 Estadísticas:")
            print(f"   📅 Primer mensaje: {first_msg.get('timestamp', 'N/A')}")
            print(f"   📅 Último mensaje: {last_msg.get('timestamp', 'N/A')}")
            print(f"   📦 Total mensajes: {len(messages)}")
    else:
        print("❌ No se encontraron mensajes válidos en el archivo")

if __name__ == "__main__":
    print("🚀 MQTT Log to CSV Converter")
    print("=" * 50)
    main()