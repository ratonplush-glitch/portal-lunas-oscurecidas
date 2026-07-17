const express = require("express");
const multer = require("multer");
const path = require("path");

const {
    importarExcel,
    importarPDF,
    editarLuna,
    eliminarLuna
} = require("../controllers/importController");

const conexion = require("../config/db");

const router = express.Router();

// =====================================
// CONFIGURACIÓN DE MULTER
// =====================================

const storage = multer.diskStorage({

    destination: (req, file, cb) => {
        cb(null, "uploads/");
    },

    filename: (req, file, cb) => {

        const extension = path.extname(file.originalname);

        const nombre =
            Date.now() +
            "-" +
            Math.round(Math.random() * 1000000) +
            extension;

        cb(null, nombre);

    }

});

const upload = multer({
    storage
});

// =====================================
// IMPORTAR EXCEL
// =====================================

router.post("/excel", upload.single("archivo"), importarExcel);

// =====================================
// IMPORTAR PDF
// =====================================

router.post("/pdf", upload.single("archivo"), importarPDF);

// =====================================
// LISTAR TODOS LOS REGISTROS
// =====================================

router.get("/lunas", (req, res) => {

    conexion.query(
        "SELECT * FROM lunas ORDER BY id DESC",
        (err, resultado) => {

            if (err) {
                return res.status(500).json({
                    ok: false,
                    mensaje: err.message
                });
            }

            res.json(resultado);

        }

    );

});

// =====================================
// CONSULTA PÚBLICA
// =====================================

router.get("/consulta/:tipo/:valor", (req, res) => {

    const { tipo, valor } = req.params;

    let sql = "";
    let dato = valor.toUpperCase();

    if (tipo === "placa") {

        sql = "SELECT * FROM lunas WHERE placa = ? LIMIT 1";

    } else if (tipo === "certificado") {

        sql = "SELECT * FROM lunas WHERE nro_certificado = ? LIMIT 1";

    } else {

        return res.json({
            ok: false,
            mensaje: "Tipo de búsqueda no válido."
        });

    }

    conexion.query(

        sql,

        [dato],

        (err, resultado) => {

            if (err) {

                return res.status(500).json({
                    ok: false,
                    mensaje: err.message
                });

            }

            if (resultado.length === 0) {

                return res.json({
                    ok: false,
                    mensaje: "No se encontró ningún registro."
                });

            }

            res.json({
                ok: true,
                registro: resultado[0]
            });

        }

    );

});

router.put("/lunas/:id", editarLuna);

// =====================================
// ELIMINAR
// =====================================

router.delete("/lunas/:id", eliminarLuna);

module.exports = router;