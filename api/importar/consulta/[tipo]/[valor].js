const { MongoClient } = require("mongodb");

let client;
let database;

async function db() {
  if (database) return database;

  client = new MongoClient(process.env.MONGODB_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 8000
  });

  await client.connect();
  database = client.db(process.env.MONGODB_DB || "portal_lunas");

  return database;
}

module.exports = async (req, res) => {
  try {
    const database = await db();

    const tipo = String(req.query.tipo || "").toLowerCase();
    const valor = String(req.query.valor || "").toUpperCase().trim();

    if (tipo !== "placa" && tipo !== "certificado") {
      return res.status(400).json({
        ok: false,
        mensaje: "Tipo de búsqueda no válido."
      });
    }

    const campo = tipo === "placa"
      ? "placa"
      : "nro_certificado";

    const registro = await database
      .collection("lunas")
      .findOne(
        { [campo]: valor },
        { projection: { _id: 0 } }
      );

    if (!registro) {
      return res.json({
        ok: false,
        mensaje: "No se encontró ningún registro."
      });
    }

    return res.json({
      ok: true,
      registro
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      ok: false,
      mensaje: error.message
    });
  }
};
