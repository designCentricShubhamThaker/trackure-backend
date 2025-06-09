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
  origin: process.env.PROD_CLIENT_URL,
  credentials: true
}));

const io = new Server(httpServer, {
  cors: {
    origin: "https://trackure-doms.vercel.app/",
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
  customers: new Map()
};

app.use('/api', routes);

app.get('/', (req, res) => {
  res.send('✅ Pragati Glass Order Management API is Running!');
});

// FIXED: Remove the nested io.on('connection') - there should only be ONE
io.on('connection', (socket) => {
  console.log(`🔌 New connection: ${socket.id}`);

  const { userId, role, team, customerEmail, orderId } = socket.handshake.query;
  
  // Handle regular users (dispatchers, team members)
  if (userId && role && role !== 'customer') {
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

  // FIXED: Handle customer connections properly
  if (role === 'customer' && orderId) {
    const customerInfo = {
      socketId: socket.id,
      orderId,
      customerEmail: customerEmail || 'anonymous',
      role: 'customer',
      connected: true
    };

    connectedUsers.set(socket.id, customerInfo);

    // Add to customer tracking
    if (!teamMembers.customers.has(orderId)) {
      teamMembers.customers.set(orderId, new Set());
    }
    teamMembers.customers.get(orderId).add(socket.id);

    console.log(`👤 Customer connected for order ${orderId}`);
    
    // Send confirmation to customer
    socket.emit('connected', { 
      success: true, 
      orderId, 
      message: 'Connected to order tracking' 
    });
  }

  socket.on('register', (userData) => {
    const { userId, role, team, orderId, customerEmail } = userData;

    if (role === 'customer' && orderId) {
      const customerInfo = {
        socketId: socket.id,
        orderId,
        customerEmail: customerEmail || 'anonymous',
        role: 'customer',
        connected: true
      };

      connectedUsers.set(socket.id, customerInfo);

      if (!teamMembers.customers.has(orderId)) {
        teamMembers.customers.set(orderId, new Set());
      }
      teamMembers.customers.get(orderId).add(socket.id);

      socket.emit('registered', { success: true, user: customerInfo });
      console.log(`👤 Customer registered for order ${orderId}`);
    } else {
      // Your existing logic unchanged
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
    }
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
        orderData: updatedOrder,
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
  });

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

  socket.on('order-deleted', (deleteData) => {
    console.log('🗑️ Order delete notification received:', deleteData.orderNumber);

    try {
      const {
        orderId,
        orderNumber,
        customerName,
        dispatcherName,
        timestamp,
        assignedTeams = []
      } = deleteData;

      const baseNotification = {
        type: 'order-deleted',
        orderId,
        orderNumber,
        customerName,
        dispatcherName,
        timestamp,
        message: `Order #${orderNumber} has been deleted`
      };

      // Send to all dispatchers
      io.to('dispatchers').emit('order-deleted', {
        ...baseNotification
      });

      assignedTeams.forEach(teamName => {
        if (teamMembers[teamName] && teamMembers[teamName].size > 0) {
          io.to(teamName).emit('order-deleted', {
            ...baseNotification,
            message: `Order #${orderNumber} assigned to ${teamName.toUpperCase()} team has been deleted`
          });

          console.log(`📤 Delete notification sent to ${teamName} team`);
        }
      });

      console.log(`📤 Order delete notification sent to all teams and dispatchers`);

    } catch (error) {
      console.error('Error handling order delete notification:', error);
    }
  });

  socket.on('timeline-update', (updateData) => {
    console.log('🚚 Timeline update received:', updateData.orderId);
    
    try {
      const { orderId, trackingData } = updateData;
      
      // Send to customers tracking this specific order
      if (teamMembers.customers.has(orderId)) {
        const customerSockets = teamMembers.customers.get(orderId);
        customerSockets.forEach(socketId => {
          io.to(socketId).emit('tracking-updated', {
            type: 'timeline-progress',
            orderId,
            ...trackingData,
            timestamp: new Date().toISOString()
          });
        });
        
        console.log(`📤 Timeline update sent to ${customerSockets.size} customers for order ${orderId}`);
      }

      // Also notify dispatchers for monitoring
      io.to('dispatchers').emit('customer-timeline-update', {
        orderId,
        customersNotified: teamMembers.customers.get(orderId)?.size || 0,
        updateData: trackingData
      });

    } catch (error) {
      console.error('Error handling timeline update:', error);
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

    if (team && teamMembers[team]) {
      teamMembers[team].add(socket.id);
      socket.join(team);
      console.log(`🔌 User joined ${team} room`);
    }
  }

  function removeUserFromTeams(socketId) {
    // Handle regular team Sets
    ['dispatchers', 'glass', 'caps', 'boxes', 'pumps'].forEach(teamName => {
      teamMembers[teamName].delete(socketId);
    });
    
    // Handle customers Map separately
    for (const [orderId, customerSockets] of teamMembers.customers.entries()) {
      customerSockets.delete(socketId);
      if (customerSockets.size === 0) {
        teamMembers.customers.delete(orderId);
      }
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

  function broadcastConnectedUsers() {
    const dispatchersList = Array.from(teamMembers.dispatchers).map(socketId => {
      const user = connectedUsers.get(socketId);
      return {
        userId: user?.userId || socketId,
        connected: true
      };
    });

    const teamLists = {};
    const allTeamMembers = [];

    ['glass', 'caps', 'boxes', 'pumps'].forEach(teamName => {
      const teamUsers = Array.from(teamMembers[teamName]).map(socketId => {
        const user = connectedUsers.get(socketId);
        return {
          userId: user?.userId || socketId,
          team: teamName,
          connected: true
        };
      });

      teamLists[teamName] = teamUsers;
      allTeamMembers.push(...teamUsers);
    });

    // Send to dispatchers
    io.to('dispatchers').emit('connected-users', {
      dispatchers: dispatchersList,
      teamMembers: allTeamMembers,
      teams: teamLists
    });

    // Send to each team
    Object.keys(teamLists).forEach(teamName => {
      if (teamMembers[teamName].size > 0) {
        io.to(teamName).emit('connected-users', {
          teamMembers: teamLists[teamName],
          dispatchers: dispatchersList
        });
      }
    });
  }

  socket.on('disconnect', () => {
    console.log(`🔌 User disconnected: ${socket.id}`);
    
    const userInfo = connectedUsers.get(socket.id);
    if (userInfo && userInfo.role === 'customer' && userInfo.orderId) {
      // Remove from customer tracking
      const orderId = userInfo.orderId;
      if (teamMembers.customers.has(orderId)) {
        teamMembers.customers.get(orderId).delete(socket.id);
        if (teamMembers.customers.get(orderId).size === 0) {
          teamMembers.customers.delete(orderId);
        }
      }
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