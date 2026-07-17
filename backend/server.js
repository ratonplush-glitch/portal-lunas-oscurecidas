const express = require("express");
const cors = require("cors");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const conexion = require("./config/db");

const usuariosRoutes = require("./routes/usuariosRoutes");
const importRoutes = require("./routes/importRoutes");
const authRoutes = require("./routes/authRoutes");
const verificarToken = require("./middleware/authMiddleware");
const app = express();

require("dotenv").config();

const PORT = process.env.PORT || 3000;
app.use(
    helmet({
        contentSecurityPolicy: false
    })
);

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: {
        ok: false,
        mensaje: "Demasiadas solicitudes. Inténtalo nuevamente más tarde."
    }
});

app.use(limiter);
// Middlewares
app.use(cors());
app.use(express.json());

// Archivos estáticos
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/assets", express.static(path.join(__dirname, "../frontend/assets")));
app.use("/styles", express.static(path.join(__dirname, "../frontend/styles")));
app.use("/services", express.static(path.join(__dirname, "../frontend/services")));
app.use("/public", express.static(path.join(__dirname, "../frontend/public")));

// Conexión a MySQL
conexion.connect((err) => {

    if (err) {
        console.error("❌ Error al conectar a MySQL:", err);
        return;
    }

    console.log("✅ Base de datos conectada correctamente");

});

// Ruta principal
app.get("/", (req, res) => {

    res.redirect("/public/index.html");

});

// Panel de administración
app.get("/panel", (req, res) => {

    res.sendFile(
        path.join(__dirname, "../frontend/pages/panel.html")
    );

});

// Módulo Lunas
app.get("/lunas", (req, res) => {

    res.sendFile(
        path.join(__dirname, "../frontend/pages/lunas.html")
    );

});

// Consulta pública
app.get("/consulta", (req, res) => {

    res.sendFile(
        path.join(__dirname, "../frontend/pages/consulta.html")
    );

});

// Rutas API
app.use("/usuarios", usuariosRoutes);
app.use("/importar", importRoutes);
app.use("/", authRoutes);


app.listen(PORT, () => {

    console.log(`Servidor iniciado en http://localhost:${PORT}`);

});