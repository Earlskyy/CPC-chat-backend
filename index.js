// server/index.js
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let waitingUser = null;

io.on("connection", (socket) => {
  console.log("✅ User connected:", socket.id);

  socket.on("joinQueue", ({ username, course }) => {
    socket.username = username;
    socket.course = course;

    if (waitingUser) {
      // Create a stable room name (sorted IDs)
      const room = [socket.id, waitingUser.id].sort().join("#");

      socket.join(room);
      waitingUser.join(room);

      socket.room = room;
      waitingUser.room = room;

      socket.emit("message", {
        sender: "System",
        text: `You are now connected with ${waitingUser.username}`,
      });
      waitingUser.emit("message", {
        sender: "System",
        text: `You are now connected with ${username}`,
      });

      waitingUser = null; // reset queue
    } else {
      waitingUser = socket;
      socket.emit("message", {
        sender: "System",
        text: "⏳ Waiting for a partner...",
      });
    }
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
      io.to(socket.room).emit("message", {
        sender: "System",
        text: "The other person left the chat.",
      });

      // Clear all sockets from the room
      io.socketsLeave(socket.room);

      // Reset all sockets' room values
      io.in(socket.room).sockets.forEach((s) => {
        s.room = null;
      });

      socket.room = null;
    }

    if (waitingUser && waitingUser.id === socket.id) {
      waitingUser = null;
    }
  });

  socket.on("disconnect", () => {
    if (waitingUser && waitingUser.id === socket.id) {
      waitingUser = null;
    }

    if (socket.room) {
      io.to(socket.room).emit("message", {
        sender: "System",
        text: "Your partner disconnected.",
      });
    }

    console.log("❌ User disconnected:", socket.id);
  });
});

server.listen(3000, () =>
  console.log("🚀 Server running on http://localhost:3000")
);
