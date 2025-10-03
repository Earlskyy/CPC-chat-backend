// server/index.js
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Queue per course: { courseName: [socket, socket, ...] }
let waitingQueues = {};

function addToQueue(socket, course) {
  if (!waitingQueues[course]) waitingQueues[course] = [];
  waitingQueues[course].push(socket);
}

function removeFromQueue(socket, course) {
  if (!waitingQueues[course]) return;
  waitingQueues[course] = waitingQueues[course].filter((s) => s.id !== socket.id);
}

function matchUsers(course) {
  if (!waitingQueues[course] || waitingQueues[course].length < 2) return;

  // Take first two users from the queue
  const [s1, s2] = waitingQueues[course].splice(0, 2);

  const room = [s1.id, s2.id].sort().join("#");
  s1.join(room);
  s2.join(room);

  s1.room = room;
  s2.room = room;

  s1.emit("message", { sender: "System", text: `🎉 Connected with ${s2.username}` });
  s2.emit("message", { sender: "System", text: `🎉 Connected with ${s1.username}` });
}

io.on("connection", (socket) => {
  console.log("✅ User connected:", socket.id);

  socket.on("joinQueue", ({ username, course }) => {
    socket.username = username;
    socket.course = course;

    // Make sure user isn’t already in queue
    removeFromQueue(socket, course);
    addToQueue(socket, course);

    socket.emit("message", { sender: "System", text: "⏳ Waiting for a partner..." });

    matchUsers(course);
  });

  socket.on("message", (msg) => {
    if (socket.room) {
      io.to(socket.room).emit("message", {
        sender: socket.username,
        text: msg,
      });
    }
  });

  socket.on("leaveChat", () => {
    if (socket.room) {
      const room = socket.room;

      io.to(room).emit("message", { sender: "System", text: "⚠️ The other person left the chat." });

      // Clear the room for everyone inside
      io.in(room).socketsLeave(room);

      // Reset room for each socket
      io.in(room).fetchSockets().then((clients) => {
        clients.forEach((s) => {
          s.room = null;
        });
      });

      socket.room = null;
    }

    removeFromQueue(socket, socket.course);
  });

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

server.listen(process.env.PORT || 3000, () =>
  console.log("🚀 Server running on http://localhost:3000")
);
