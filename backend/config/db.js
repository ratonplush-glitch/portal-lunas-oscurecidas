const mysql = require("mysql2");

const conexion = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT) || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

conexion.getConnection((err, connection) => {
    if (err) {
        console.error("❌ Error al conectar a MySQL:", err);
        return;
    }

    console.log("✅ Conectado correctamente a MySQL");
    connection.release();
});

module.exports = conexion;
