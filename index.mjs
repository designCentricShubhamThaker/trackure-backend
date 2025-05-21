import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { createServer } from 'http';
import './config/db.js';
import routes from './routes/index.js';


dotenv.config();

const app = express();
app.use(express.json());

const httpServer = createServer(app);

app.use(cors({
  origin:process.env.LOCAL_CLIENT_URL,
  credentials: true
}));

app.use('/api', routes);

app.get('/', (req, res) => {
  res.send('✅ Pragati Glass Order Management API is Running!');
});




const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Server ready for connections`);
});

export default app;