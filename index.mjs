import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import './config/db.js';
import routes from './routes/index.js';


dotenv.config();

const app = express();
app.use(express.json());

const httpServer = createServer(app);

app.use(cors({
  origin: process.env.LOCAL_CLIENT_URL,
  credentials: true
}));

const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true
  }
});

const connectedUsers = new Map();
const teamMembers = {
  dispatchers: new Set(),
  glass: new Set(),
  caps: new Set(),
  boxes: new Set(),
  pumps: new Set(),
  customers: new Set()

};

const trackingDataStore = new Map();


app.use('/api', routes);

app.get('/', (req, res) => {
  res.send('✅ Pragati Glass Order Management API is Running!');
});



io.on('connection', (socket) => {
  console.log(`🔌 New connection: ${socket.id}`);

  const { userId, role, team } = socket.handshake.query;
  if (userId && role) {
    const userInfo = {
      socketId: socket.id,
      userId,
      role,
      team: team?.toLowerCase().trim(),
      connected: true
    };

    connectedUsers.set(socket.id, userInfo);
    addUserToTeams(socket, userInfo);
    broadcastConnectedUsers();
  }

  socket.on('register', (userData) => {
    const { userId, role, team } = userData;
    const userInfo = {
      socketId: socket.id,
      userId: userId || socket.id,
      role,
      team: team?.toLowerCase().trim(),
      connected: true
    };

    removeUserFromTeams(socket.id);
    connectedUsers.set(socket.id, userInfo);
    addUserToTeams(socket, userInfo);

    socket.emit('registered', { success: true, user: userInfo });
    broadcastConnectedUsers();
  });

  socket.on('new-order-created', (orderData) => {
    console.log('📦 New order notification received:', orderData.orderNumber);

    try {
      const { order, assignedTeams, dispatcherName, customerName, orderNumber, timestamp } = orderData;

      const baseNotification = {
        type: 'new-order',
        orderNumber,
        customerName,
        dispatcherName,
        timestamp,
        message: `New order #${orderNumber} created for ${customerName}`
      };

      // Send full order to dispatchers
      io.to('dispatchers').emit('new-order', {
        ...baseNotification,
        orderData: order
      });

      // Send filtered data to each team
      assignedTeams.forEach(teamName => {
        if (teamMembers[teamName] && teamMembers[teamName].size > 0) {
          const filteredOrder = filterOrderForTeam(order, teamName);

          io.to(teamName).emit('new-order', {
            ...baseNotification,
            message: `New order #${orderNumber} assigned to ${teamName.toUpperCase()} team`,
            orderData: filteredOrder
          });

          console.log(`📤 Filtered order sent to ${teamName} team`);
        }
      });

    } catch (error) {
      console.error('Error handling order notification:', error);
    }
  });


  socket.on('team-progress-updated', (progressData) => {
    console.log('📈 Team progress update received:', {
      order: progressData.orderNumber,
      team: progressData.team,
      item: progressData.itemName
    });

    try {
      const {
        orderNumber,
        itemName,
        team,
        updates,
        updatedOrder,
        customerName,
        dispatcherName,
        timestamp
      } = progressData;

      const notificationData = {
        type: 'team-progress-update',
        orderNumber,
        itemName,
        team: team.toUpperCase(),
        customerName,
        dispatcherName,
        timestamp,
        updates,
        orderData: updatedOrder, // This is the key - make sure updatedOrder is included
        message: `${team.toUpperCase()} team updated progress for ${itemName} in order #${orderNumber}`
      };

      // Send to all dispatchers (admins)
      io.to('dispatchers').emit('team-progress-updated', notificationData);

      // Also emit to all connected clients in case dispatcher isn't in dispatchers room
      socket.broadcast.emit('team-progress-updated', notificationData);

      console.log(`📤 Progress update sent to dispatchers for order #${orderNumber}`);
      console.log(`📊 Dispatchers room size:`, io.sockets.adapter.rooms.get('dispatchers')?.size || 0);

    } catch (error) {
      console.error('Error handling team progress update:', error);
    }
  });;


  socket.on('order-edited', (editData) => {
    console.log('✏️ Order edit notification received:', editData.orderNumber);

    try {
      const {
        order,
        assignedTeams,
        dispatcherName,
        customerName,
        orderNumber,
        timestamp,
        editedFields,
        previousAssignedTeams = []
      } = editData;

      const baseNotification = {
        type: 'order-edited',
        orderNumber,
        customerName,
        dispatcherName,
        timestamp,
        editedFields,
        message: `Order #${orderNumber} has been updated`
      };


      io.to('dispatchers').emit('order-updated', {
        ...baseNotification,
        orderData: order
      });

      const allAffectedTeams = new Set([...assignedTeams, ...previousAssignedTeams]);


      allAffectedTeams.forEach(teamName => {
        if (teamMembers[teamName] && teamMembers[teamName].size > 0) {
          const filteredOrder = filterOrderForTeam(order, teamName);

          const hasCurrentAssignments = assignedTeams.includes(teamName);

          io.to(teamName).emit('order-updated', {
            ...baseNotification,
            message: hasCurrentAssignments
              ? `Order #${orderNumber} assigned to ${teamName.toUpperCase()} team has been updated`
              : `Order #${orderNumber} no longer assigned to ${teamName.toUpperCase()} team`,
            orderData: filteredOrder,
            hasAssignments: hasCurrentAssignments,
            wasRemoved: !hasCurrentAssignments && previousAssignedTeams.includes(teamName)
          });

          console.log(`📤 Updated order sent to ${teamName} team (hasAssignments: ${hasCurrentAssignments})`);
        }
      });

    } catch (error) {
      console.error('Error handling order edit notification:', error);
    }
  });

 

  socket.on('join-order-tracking', (trackingData) => {
    const { orderId, customerInfo } = trackingData;

    if (orderId) {
      const roomName = `order_${orderId}`;
      socket.join(roomName);

      // Store customer connection info
      const customerData = {
        socketId: socket.id,
        orderId,
        customerInfo,
        connected: true,
        role: 'customer' // Add role for customer
      };

      customerOrderRooms.set(socket.id, { orderId, roomName });
      teamMembers.customers.add(socket.id);
      connectedUsers.set(socket.id, customerData);

      console.log(`🛍️ Customer joined order tracking room: ${roomName}`);

      // Send current tracking data immediately
      const currentTracking = getTrackingData(orderId);
      if (currentTracking) {
        socket.emit('order-status-updated', {
          type: 'initial-status',
          orderId,
          ...currentTracking,
          timestamp: new Date().toISOString()
        });
        console.log(`📤 Sent current tracking data to customer: ${orderId}`);
      }

      // Confirm connection to customer
      socket.emit('tracking-connected', {
        success: true,
        orderId,
        message: 'Connected to order tracking',
        trackingData: currentTracking
      });

      // Notify dispatchers about customer joining
      socket.to('dispatchers').emit('customer-joined-tracking', {
        orderId,
        customerInfo,
        timestamp: new Date().toISOString()
      });
    }
  });

  socket.on('tracking-update', (updateData) => {
    console.log('📍 Tracking update received:', updateData);

    try {
      const { orderId, trackingData } = updateData;

      if (orderId) {
        // Save to server storage
        saveTrackingData(orderId, trackingData);

        const roomName = `order_${orderId}`;

        // Send to customers in the order room
        io.to(roomName).emit('order-status-updated', {
          type: 'tracking-update',
          orderId,
          ...trackingData,
          timestamp: new Date().toISOString()
        });

        console.log(`📤 Tracking update sent to room: ${roomName}`);

        // Also send to dispatchers for monitoring
        io.to('dispatchers').emit('customer-tracking-update', {
          orderId,
          trackingData,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Error handling tracking update:', error);
    }
  });

  function addUserToTeams(socket, userInfo) {
    const { role, team } = userInfo;

    // Fix: Make sure admin role joins dispatchers room
    if (role === 'admin' || role === 'dispatcher') {
      teamMembers.dispatchers.add(socket.id);
      socket.join('dispatchers');
      console.log(`🔌 Admin/Dispatcher joined dispatchers room: ${socket.id}`);
    }

    // Add customer role handling
    if (role === 'customer') {
      teamMembers.customers.add(socket.id);
      socket.join('customers');
      console.log(`🔌 Customer joined customers room: ${socket.id}`);
    }

    if (team && teamMembers[team]) {
      teamMembers[team].add(socket.id);
      socket.join(team);
      console.log(`🔌 User joined ${team} room`);
    }
  }

  function removeUserFromTeams(socketId) {
    Object.values(teamMembers).forEach(team => team.delete(socketId));

    // Clean up customer order room tracking
    if (customerOrderRooms.has(socketId)) {
      customerOrderRooms.delete(socketId);
    }
  }

  function filterOrderForTeam(order, teamName) {
    return {
      ...order,
      item_ids: order.item_ids?.map(item => ({
        ...item,
        team_assignments: {
          [teamName]: item.team_assignments?.[teamName] || []
        }
      })).filter(item => item.team_assignments[teamName]?.length > 0) || []
    };
  }

  socket.on('disconnect', () => {
    console.log(`🔌 User disconnected: ${socket.id}`);

    if (customerOrderRooms.has(socket.id)) {
      const { orderId } = customerOrderRooms.get(socket.id);
      console.log(`🛍️ Customer disconnected from order tracking: ${orderId}`);
    }

    removeUserFromTeams(socket.id);
    connectedUsers.delete(socket.id);
    broadcastConnectedUsers();
  });

  function getTrackingData(orderId) {
    return trackingDataStore.get(orderId) || null;
  }

  // Add this helper function to save tracking data
  function saveTrackingData(orderId, trackingData) {
    trackingDataStore.set(orderId, {
      ...trackingData,
      lastUpdated: new Date().toISOString()
    });
    console.log(`💾 Saved tracking data for order: ${orderId}`);
  }


  socket.on('disconnect', () => {
    console.log(`🔌 User disconnected: ${socket.id}`);

    // Handle customer order tracking cleanup
    if (customerOrderRooms.has(socket.id)) {
      const { orderId, customerInfo } = customerOrderRooms.get(socket.id);
      console.log(`🛍️ Customer disconnected from order tracking: ${orderId}`);

      // Notify dispatchers about customer leaving
      socket.to('dispatchers').emit('customer-left-tracking', {
        orderId,
        customerInfo,
        timestamp: new Date().toISOString()
      });

      customerOrderRooms.delete(socket.id);
    }

    removeUserFromTeams(socket.id);
    connectedUsers.delete(socket.id);
    broadcastConnectedUsers();
  });
});

const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});