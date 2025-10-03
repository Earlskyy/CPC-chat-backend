// server/index.js
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Queue per course: { courseName: [socket, socket, ...] }
let waitingQueues = {};

// Add socket to waiting queue
function addToQueue(socket, course) {
  if (!waitingQueues[course]) waitingQueues[course] = [];
  waitingQueues[course].push(socket);
}

// Remove socket from waiting queue
function removeFromQueue(socket, course) {
  if (!waitingQueues[course]) return;
  waitingQueues[course] = waitingQueues[course].filter((s) => s.id !== socket.id);
}

// Try to match two users in same course
function matchUsers(course) {
  if (!waitingQueues[course] || waitingQueues[course].length < 2) return;

  // Take first two users from the queue
  const [s1, s2] = waitingQueues[course].splice(0, 2);

  const room = [s1.id, s2.id].sort().join("#");
  s1.join(room);
  s2.join(room);

  s1.room = room;
  s2.room = room;

  // System message with highlight + course info
  s1.emit("message", {
    sender: "System",
    text: `🎉 Connected with ${s2.username} from ${s2.course}`,
    highlight: true,
  });
  s2.emit("message", {
    sender: "System",
    text: `🎉 Connected with ${s1.username} from ${s1.course}`,
    highlight: true,
  });
}

io.on("connection", (socket) => {
  console.log("✅ User connected:", socket.id);

  // User joins the queue
  socket.on("joinQueue", ({ username, course }) => {
    socket.username = username;
    socket.course = course;

    // Make sure user isn’t already in queue
    removeFromQueue(socket, course);
    addToQueue(socket, course);

    socket.emit("message", {
      sender: "System",
      text: "⏳ Waiting for a partner...",
    });

    matchUsers(course);
  });

  // Handle chat messages
  socket.on("message", (msg) => {
    if (socket.room) {
      io.to(socket.room).emit("message", {
        sender: socket.username,
        text: msg,
      });
    }
  });

  // Typing indicator
  socket.on("typing", () => {
    if (socket.room) {
      socket.to(socket.room).emit("typing", socket.username);
    }
  });

  socket.on("stopTyping", () => {
    if (socket.room) {
      socket.to(socket.room).emit("stopTyping");
    }
  });

  // User leaves the chat manually
  socket.on("leaveChat", async () => {
    if (socket.room) {
      const room = socket.room;

      io.to(room).emit("message", {
        sender: "System",
        text: "⚠️ The other person left the chat.",
      });

      // Grab sockets before removing them from the room
      const clients = await io.in(room).fetchSockets();
      clients.forEach((s) => {
        s.room = null;
      });

      io.in(room).socketsLeave(room);
      socket.room = null;
    }

    removeFromQueue(socket, socket.course);
  });

  // Handle disconnects
  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);

    removeFromQueue(socket, socket.course);

    if (socket.room) {
      io.to(socket.room).emit("message", {
        sender: "System",
        text: "⚠️ Your partner disconnected.",
      });
    }
  });
});

// Start server
server.listen(process.env.PORT || 3000, () =>
  console.log("🚀 Server running on http://localhost:3000")
);
