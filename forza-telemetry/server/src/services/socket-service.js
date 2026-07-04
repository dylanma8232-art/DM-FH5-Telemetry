import { Server } from 'socket.io';

class SocketService {
  constructor() {
    this.io = null;
    this.connectedClients = new Set();
  }

  attach(httpServer) {
    this.io = new Server(httpServer, {
      cors: { origin: '*' },
      transports: ['websocket', 'polling']
    });

    this.io.on('connection', (socket) => {
      this.connectedClients.add(socket.id);
      console.log(`[Socket] Client connected: ${socket.id} (Total: ${this.connectedClients.size})`);

      socket.on('disconnect', () => {
        this.connectedClients.delete(socket.id);
        console.log(`[Socket] Client disconnected: ${socket.id} (Total: ${this.connectedClients.size})`);
      });
    });
  }

  emit(event, data) {
    if (this.io) {
      this.io.emit(event, data);
    }
  }

  getConnectedCount() {
    return this.connectedClients.size;
  }
}

export const socketService = new SocketService();
