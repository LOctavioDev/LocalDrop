# LocalDrop

Una aplicación web para transferir archivos entre dispositivos en la misma red local (LAN/Wi-Fi), similar a AirDrop o Google Drive local.

## Características

- ✅ Drag & drop para subir archivos
- ✅ Selección de archivos mediante botón
- ✅ Lista de archivos disponibles con nombre, tamaño y fecha
- ✅ Descarga de archivos
- ✅ Eliminación de archivos
- ✅ Barra de progreso de subida
- ✅ Manejo de archivos grandes con streams (sin cargar en memoria)
- ✅ Acceso desde cualquier dispositivo en la red local
- ✅ Seguridad básica (prevención de path traversal, sanitización de nombres)

## Requisitos

- **Node.js** v18 o superior
- **npm** v9 o superior
- Conexión a la misma red LAN/Wi-Fi entre dispositivos

## Instalación

1. Clona o descarga este repositorio
2. Instala las dependencias:

```bash
# Desde la raíz del proyecto
npm install

# O instala cada parte por separado
cd backend && npm install
cd ../frontend && npm install
```

## Ejecución

### Modo Desarrollo (Recomendado)

Desde la raíz del proyecto, ejecuta:

```bash
npm run dev
```

Este comando ejecutará simultáneamente:
- Backend en `http://0.0.0.0:3001`
- Frontend en `http://0.0.0.0:5173`

### Ejecutar Backend y Frontend por separado

Si prefieres ejecutarlos en terminales separadas:

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

## Acceso a la Aplicación

### Desde la misma Mac (desarrollo local)

Abre tu navegador y visita:
```
http://localhost:5173
```

### Desde otros dispositivos en la red local

1. **Encuentra la IP local de tu Mac:**

   ```bash
   ifconfig | grep "inet " | grep -v 127.0.0.1
   ```

   Busca algo como `inet 192.168.1.X` o `inet 10.0.0.X`

   Alternativamente, ve a:
   - **System Preferences** → **Network** → Tu conexión activa
   - La IP aparecerá como "IP Address"

2. **Accede desde cualquier navegador en la red:**

   ```
   http://<TU_IP_LOCAL>:5173
   ```

   Por ejemplo:
   ```
   http://192.168.1.15:5173
   ```

### Acceso específico desde Windows 11

1. Asegúrate de que ambos dispositivos estén en la misma red Wi-Fi
2. Obtén la IP local de tu Mac (ver arriba)
3. En Windows, abre cualquier navegador (Chrome, Firefox, Edge)
4. Navega a `http://<IP_DE_TU_MAC>:5173`

**Ejemplo:**
```
http://192.168.1.15:5173
```

## Posibles Problemas de Firewall (macOS)

Si no puedes acceder desde otro dispositivo, el firewall de macOS podría estar bloqueando conexiones entrantes.

### Solución 1: Permitir conexiones para Node.js

Cuando ejecutes el servidor por primera vez, macOS debería mostrar un diálogo preguntando si quieres permitir conexiones entrantes. Haz clic en **"Allow"**.

### Solución 2: Configurar manualmente el Firewall

1. Ve a **System Preferences** → **Security & Privacy** → **Firewall**
2. Haz clic en el candado para hacer cambios
3. Haz clic en **"Firewall Options"**
4. Asegúrate de que **"Block all incoming connections"** NO esté marcado
5. Encuentra `node` en la lista y asegúrate de que esté configurado como **"Allow incoming connections"**

### Solución 3: Deshabilitar temporalmente el firewall (solo para pruebas)

1. Ve a **System Preferences** → **Security & Privacy** → **Firewall**
2. Haz clic en **"Turn Off Firewall"**
3. Prueba la conexión
4. **IMPORTANTE**: Vuelve a habilitar el firewall después de las pruebas

### Verificar conectividad desde Windows

Desde Windows, puedes verificar si puedes alcanzar tu Mac:

```cmd
ping <IP_DE_TU_MAC>
```

Si el ping funciona pero no puedes acceder a la aplicación, es un problema de firewall.

## Cambiar el Puerto

### Puerto del Backend

Edita `backend/src/server.ts`:
```typescript
const PORT = process.env.PORT || 3001; // Cambia 3001 por el puerto deseado
```

O usa una variable de entorno:
```bash
PORT=8080 npm run dev
```

### Puerto del Frontend

Edita `frontend/vite.config.ts`:
```typescript
server: {
  port: 5173, // Cambia por el puerto deseado
  // ...
}
```

**IMPORTANTE:** Si cambias el puerto del backend, también debes actualizar el proxy en `frontend/vite.config.ts`:

```typescript
proxy: {
  '/api': {
    target: 'http://localhost:3001', // Cambia el puerto aquí
    changeOrigin: true,
  },
}
```

## Almacenamiento de Archivos

Los archivos subidos se almacenan en:
```
backend/storage/
```

Este directorio se crea automáticamente cuando ejecutas el backend por primera vez.

**IMPORTANTE:**
- Los archivos se guardan físicamente en el disco (no en memoria)
- El filesystem es la fuente de verdad (no hay base de datos)
- Los archivos duplicados reciben un timestamp: `archivo-1234567890.txt`

## Ejecutar Pruebas

```bash
cd backend
npm test
```

Las pruebas incluyen:
- Listar archivos
- Subir archivos
- Descargar archivos
- Eliminar archivos
- Prevención de path traversal
- Manejo de nombres duplicados
- Sanitización de nombres de archivos

## Tecnologías Utilizadas

### Backend
- Node.js
- TypeScript
- Express
- Multer (manejo de archivos con streams)
- CORS

### Frontend
- React
- TypeScript
- Vite
- Axios

## Próximos Pasos: Deployment en Ubuntu Server

Una vez que hayas validado que la aplicación funciona correctamente desde tu Mac y Windows, puedes desplegarla en un Ubuntu Server permanente en tu red local.

### Preparación

1. **Instala Node.js en Ubuntu:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. **Transfiere el proyecto al servidor:**
   ```bash
   scp -r LocalDrop usuario@ip-del-servidor:/home/usuario/
   ```

3. **Instala dependencias:**
   ```bash
   cd LocalDrop
   npm install
   ```

4. **Construye el frontend para producción:**
   ```bash
   cd frontend
   npm run build
   ```

5. **Configura el backend para servir el frontend estático:**

   Edita `backend/src/server.ts` y añade antes de las rutas:
   ```typescript
   import path from 'path';

   // Serve static files from frontend build
   app.use(express.static(path.join(__dirname, '../../frontend/dist')));
   ```

6. **Ejecuta en producción con PM2:**
   ```bash
   sudo npm install -g pm2
   cd backend
   npm run build
   pm2 start dist/server.js --name localdrop
   pm2 save
   pm2 startup
   ```

7. **Encuentra la IP del servidor Ubuntu:**
   ```bash
   ip addr show | grep "inet " | grep -v 127.0.0.1
   ```

8. **Accede desde cualquier dispositivo:**
   ```
   http://<IP_DEL_SERVIDOR>:3001
   ```

### Notas de Seguridad para Producción

Cuando despliegues en Ubuntu Server:
- Considera añadir autenticación básica
- Configura un firewall (ufw) para permitir solo ciertos puertos
- Usa HTTPS con certificados autofirmados o Let's Encrypt
- Limita el tamaño máximo de archivos según tus necesidades
- Considera añadir rate limiting para prevenir abuso

## Estructura del Proyecto

```
LocalDrop/
├── backend/
│   ├── src/
│   │   ├── server.ts          # Servidor principal (escucha en 0.0.0.0:3001)
│   │   ├── routes/
│   │   │   └── files.ts       # API REST para archivos
│   │   ├── middleware/
│   │   │   └── upload.ts      # Configuración de multer
│   │   └── utils/
│   │       └── fileUtils.ts   # Sanitización y validación
│   ├── storage/               # Archivos subidos (creado automáticamente)
│   ├── tests/
│   │   └── api.test.ts       # Pruebas unitarias
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx           # Componente principal
│   │   ├── components/
│   │   │   ├── DropZone.tsx
│   │   │   ├── FileList.tsx
│   │   │   └── UploadProgress.tsx
│   │   ├── services/
│   │   │   └── api.ts        # Cliente API
│   │   └── types/
│   │       └── index.ts      # Tipos TypeScript
│   ├── package.json
│   ├── vite.config.ts        # Configuración de Vite (proxy, host 0.0.0.0)
│   └── tsconfig.json
│
├── package.json              # Scripts raíz
└── README.md
```

## API Endpoints

- `GET /api/files` - Lista todos los archivos
- `POST /api/files` - Sube un archivo (multipart/form-data)
- `GET /api/files/:filename/download` - Descarga un archivo
- `DELETE /api/files/:filename` - Elimina un archivo
- `GET /health` - Health check del backend

## Solución de Problemas

### Error: "Cannot GET /api/files"
- El backend no está corriendo. Ejecuta `npm run dev` desde la raíz o `npm run dev` desde `backend/`

### Error: "Network Error" en el frontend
- Verifica que el backend esté corriendo en el puerto 3001
- Verifica que el proxy esté configurado correctamente en `vite.config.ts`

### No puedo acceder desde otro dispositivo
- Verifica que ambos dispositivos estén en la misma red
- Verifica la IP local con `ifconfig` (macOS) o `ipconfig` (Windows)
- Verifica el firewall (ver sección de Firewall arriba)
- Asegúrate de usar `http://` (no `https://`)

### Los archivos no se guardan
- Verifica permisos del directorio `backend/storage/`
- El directorio debería crearse automáticamente, pero puedes crearlo manualmente:
  ```bash
  mkdir -p backend/storage
  chmod 755 backend/storage
  ```

## Licencia

MIT

## Contribuciones

Este es un proyecto personal de aprendizaje. No se aceptan contribuciones en este momento.
# LocalDrop
