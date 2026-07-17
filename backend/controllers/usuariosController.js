const conexion = require("../config/db");

const listarUsuarios = (req, res) => {

    const sql = `
        SELECT
            id,
            usuario,
            nombre,
            correo,
            rol,
            estado,
            ultimo_login,
            fecha_creacion
        FROM usuarios
        ORDER BY id DESC
    `;

    conexion.query(sql, (err, resultados) => {

        if (err) {

            return res.status(500).json({
                ok: false,
                mensaje: err.message
            });

        }

        res.json({
            ok: true,
            total: resultados.length,
            usuarios: resultados
        });

    });

};

module.exports = {
    listarUsuarios
};