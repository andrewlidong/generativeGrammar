const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Translate } = require('@google-cloud/translate').v2;
const { LanguageServiceClient } = require('@google-cloud/language');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
const keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;

// Initialize Google Cloud clients
const translate = new Translate({ projectId, keyFilename });
const languageDetection = new LanguageServiceClient({ projectId, keyFilename });

const users = new Map();

io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('join', ({ userId, language }) => {
    users.set(socket.id, { userId, language });
    console.log(`User ${userId} joined with preferred language ${language}`);
  });

  socket.on('sendMessage', async (message) => {
    const sender = users.get(socket.id);
    if (!sender) return;

    try {
      // Detect the language of the message
      const [detection] = await languageDetection.detectLanguage({
        content: message.text,
      });
      const detectedLanguage = detection.language;

      // Translate the message for each user
      for (const [socketId, user] of users) {
        if (user.language !== detectedLanguage) {
          const [translation] = await translate.translate(message.text, user.language);
          io.to(socketId).emit('message', {
            ...message,
            translatedText: translation,
            originalLanguage: detectedLanguage
          });
        } else {
          io.to(socketId).emit('message', {
            ...message,
            originalLanguage: detectedLanguage
          });
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  socket.on('disconnect', () => {
    users.delete(socket.id);
    console.log('A user disconnected');
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
