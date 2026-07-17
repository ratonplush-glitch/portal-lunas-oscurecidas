const mysql = require("mysql2");

const conexion = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "portal_lunas"
});

conexion.connect((err) => {
    if (err) {
        console.error("❌ Error al conectar a MySQL:", err);
        return;
    }

    console.log("✅ Conectado correctamente a MySQL");
});

module.exports = conexion;