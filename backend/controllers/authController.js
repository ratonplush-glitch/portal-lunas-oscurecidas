const conexion = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const login = (req, res) => {

    const { usuario, password } = req.body;

    if (!usuario || !password) {

        return res.status(400).json({
            ok: false,
            mensaje: "Complete todos los campos"
        });

    }

    const sql = `
        SELECT *
        FROM usuarios
        WHERE usuario = ?
        LIMIT 1
    `;

    conexion.query(sql, [usuario], async (err, resultado) => {

        if (err) {

            return res.status(500).json({
                ok: false,
                mensaje: "Error de base de datos"
            });

        }

        if (resultado.length === 0) {

            return res.json({
                ok: false,
                mensaje: "Usuario o contraseña incorrectos"
            });

        }

        const usuarioDB = resultado[0];

        let acceso = false;
                if (usuarioDB.password.startsWith("$2")) {

            acceso = await bcrypt.compare(
                password,
                usuarioDB.password
            );

        } else {

            acceso = (password === usuarioDB.password);

            if (acceso) {

                const hash = await bcrypt.hash(password, 10);

                conexion.query(
                    "UPDATE usuarios SET password=? WHERE id=?",
                    [hash, usuarioDB.id]
                );

            }

        }

        if (!acceso) {

            return res.json({
                ok: false,
                mensaje: "Usuario o contraseña incorrectos"
            });

        }

        const token = jwt.sign(
            {
                id: usuarioDB.id,
                usuario: usuarioDB.usuario,
                rol: usuarioDB.rol
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "8h"
            }
        );

        return res.json({
            ok: true,
            mensaje: "Bienvenido",
            token,
            usuario: {
                id: usuarioDB.id,
                usuario: usuarioDB.usuario,
                nombre: usuarioDB.nombre,
                rol: usuarioDB.rol
            }
        });
            });

};

module.exports = {
    login
};