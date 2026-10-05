import express from 'express';
import cors from 'cors';
import path from 'path';
import filesRouter from './routes/files';
import { ensureStorageDir } from './utils/fileUtils';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = '0.0.0.0'; // Listen on all network interfaces for LAN access
const FRONTEND_DIST = path.join(__dirname, '../../frontend/dist');

// Middleware
app.use(cors()); // Allow requests from any origin (LAN devices)
app.use(express.json());

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', message: 'LocalDrop backend is running' });
});

// API routes
app.use('/api/files', filesRouter);

// Serve the built frontend (production) so the backend is a single
// entry point: run it and LocalDrop is already reachable.
app.use(express.static(FRONTEND_DIST));
app.get(/^(?!\/api|\/health).*/, (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
});

// Error handling middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize and start server
async function startServer() {
  try {
    // Ensure storage directory exists
    await ensureStorageDir();

    // Start listening
    app.listen(PORT, HOST, () => {
      console.log('\n==============================================');
      console.log('🚀 LocalDrop Backend Server Started!');
      console.log('==============================================');
      console.log(`📡 Listening on: http://${HOST}:${PORT}`);
      console.log(`🏠 Local access: http://localhost:${PORT}`);
      console.log(`🌐 Network access: http://<YOUR_LOCAL_IP>:${PORT}`);
      console.log('==============================================\n');
      console.log('💡 To find your local IP address:');
      console.log('   macOS: ifconfig | grep "inet " | grep -v 127.0.0.1');
      console.log('   Linux: ip addr show | grep "inet " | grep -v 127.0.0.1');
      console.log('   Windows: ipconfig | findstr IPv4');
      console.log('\n==============================================\n');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export default app;
