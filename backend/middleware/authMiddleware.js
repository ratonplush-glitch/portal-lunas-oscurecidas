const jwt = require("jsonwebtoken");

const verificarToken = (req, res, next) => {

    const authHeader = req.headers.authorization;

    if (!authHeader) {

        return res.status(401).json({
            ok: false,
            mensaje: "Token no proporcionado"
        });

    }

    const partes = authHeader.split(" ");

    if (partes.length !== 2 || partes[0] !== "Bearer") {

        return res.status(401).json({
            ok: false,
            mensaje: "Formato de token inválido"
        });

    }

    const token = partes[1];

    try {

        const datos = jwt.verify(token, process.env.JWT_SECRET);

        req.usuario = datos;

        next();

    } catch (error) {

        return res.status(401).json({
            ok: false,
            mensaje: "Token inválido o expirado"
        });

    }

};

module.exports = verificarToken;