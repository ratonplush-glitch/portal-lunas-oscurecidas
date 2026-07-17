const xlsx = require("xlsx");
const pdf = require("pdf-parse");
const fs = require("fs");
const path = require("path");

const conexion = require("../config/db");

const importarExcel = async (req, res) => {

    try {

        if (!req.file) {
            return res.status(400).json({
                ok: false,
                mensaje: "No se recibió ningún archivo Excel"
            });
        }

        const libro = xlsx.readFile(req.file.path);

        const hoja = libro.Sheets[libro.SheetNames[0]];

        const datos = xlsx.utils.sheet_to_json(hoja);

        fs.unlinkSync(req.file.path);

        return res.json({
            ok: true,
            total: datos.length,
            registros: datos
        });

    } catch (error) {

        return res.status(500).json({
            ok: false,
            mensaje: error.message
        });

    }

};

const obtenerDato = (texto, patron) => {

    const resultado = texto.match(patron);

    return resultado ? resultado[1].trim() : "";

};

const importarPDF = async (req, res) => {

    try {

        if (!req.file) {

            return res.status(400).json({
                ok: false,
                mensaje: "No se recibió ningún PDF"
            });

        }

        const rutaPDF = req.file.path;

        const buffer = fs.readFileSync(rutaPDF);

        const resultado = await pdf(buffer);

        const texto = resultado.text.replace(/\r/g, "");

        console.log("========== TEXTO DEL PDF ==========");
        console.log(texto);
        console.log("==================================");

        const placa = obtenerDato(
            texto,
            /Placa\s*:\s*([A-Z0-9]+)/i
        );

        const numero_certificado = obtenerDato(
            texto,
            /NRO:\s*([A-Z0-9]+)/i
        );

        const propietario = obtenerDato(
            texto,
            /DATOS DEL SOLICITANTE[\s\S]*?\n([A-ZÁÉÍÓÚÑ ]+)\n/
        );

        const categoria = obtenerDato(
            texto,
            /Categoría:\s*([A-Z0-9]+)/i
        );

        const marca = obtenerDato(
            texto,
            /Marca\s*:\s*([A-Z0-9 ]+)/i
        );

        const modelo = obtenerDato(
            texto,
            /Modelo\s*:\s*([A-Z0-9- ]+)/i
        );

        const color = obtenerDato(
            texto,
            /Color\s*:\s*([A-Z ]+)/i
        );

        const motor = obtenerDato(
            texto,
            /Motor\s*:\s*([A-Z0-9- ]+)/i
        );

        const serie = obtenerDato(
            texto,
            /Serie\s*:\s*([A-Z0-9- ]+)/i
        );

        const anio = obtenerDato(
            texto,
            /Año:\s*([0-9]{4})/i
        );

        const archivo_pdf = path.basename(rutaPDF);

        const video = "";
        const sql = `
INSERT INTO lunas
(
    placa,
    numero_resolucion,
    fecha_resolucion,
    nro_certificado,
    propietario,
    categoria,
    marca,
    modelo,
    color,
    motor,
    serie,
    anio,
    fecha_emision,
    archivo_pdf,
    video
)
VALUES
(
    ?, '', CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), ?, ?
)

ON DUPLICATE KEY UPDATE

numero_resolucion='',
fecha_resolucion=CURDATE(),
nro_certificado=VALUES(nro_certificado),
propietario=VALUES(propietario),
categoria=VALUES(categoria),
marca=VALUES(marca),
modelo=VALUES(modelo),
color=VALUES(color),
motor=VALUES(motor),
serie=VALUES(serie),
anio=VALUES(anio),
fecha_emision=CURDATE(),
archivo_pdf=VALUES(archivo_pdf),
video=VALUES(video)
`;

conexion.query(
    sql,
    [
        placa,
        numero_certificado,
        propietario,
        categoria,
        marca,
        modelo,
        color,
        motor,
        serie,
        anio,
        archivo_pdf,
        video
    ],
    (err) => {

        if (err) {

            return res.status(500).json({
                ok: false,
                mensaje: err.message
            });

        }

        return res.json({
            ok: true,
            mensaje: "PDF importado correctamente",
            placa,
            propietario,
            certificado: numero_certificado
        });

    }

);
    } catch (error) {

        return res.status(500).json({
            ok: false,
            mensaje: error.message
        });

    }

};

// ===============================
// EDITAR REGISTRO
// ===============================

const editarLuna = (req, res) => {

    const { id } = req.params;

    const {
        placa,
        propietario,
        nro_certificado,
        categoria,
        marca,
        modelo,
        color,
        motor,
        serie,
        anio
    } = req.body;

    const sql = `
        UPDATE lunas
        SET
            placa = ?,
            propietario = ?,
            nro_certificado = ?,
            categoria = ?,
            marca = ?,
            modelo = ?,
            color = ?,
            motor = ?,
            serie = ?,
            anio = ?
        WHERE id = ?
    `;

    conexion.query(
        sql,
        [
            placa,
            propietario,
            nro_certificado,
            categoria,
            marca,
            modelo,
            color,
            motor,
            serie,
            anio,
            id
        ],
        (err) => {

            if (err) {

                return res.status(500).json({
                    ok: false,
                    mensaje: err.message
                });

            }

            return res.json({
                ok: true,
                mensaje: "Registro actualizado correctamente"
            });

        }
    );

};

// ===============================
// ELIMINAR REGISTRO
// ===============================

const eliminarLuna = (req, res) => {

    const { id } = req.params;

    conexion.query(
        "DELETE FROM lunas WHERE id = ?",
        [id],
        (err) => {

            if (err) {

                return res.status(500).json({
                    ok: false,
                    mensaje: err.message
                });

            }

            return res.json({
                ok: true,
                mensaje: "Registro eliminado correctamente"
            });

        }
    );

};

module.exports = {
    importarExcel,
    importarPDF,
    editarLuna,
    eliminarLuna
};