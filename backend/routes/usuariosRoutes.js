const express = require("express");

const router = express.Router();

const {
    listarUsuarios
} = require("../controllers/usuariosController");

// Obtener todos los usuarios
router.get("/", listarUsuarios);

module.exports = router;