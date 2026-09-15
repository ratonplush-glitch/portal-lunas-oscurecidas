const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const xlsx = require('xlsx');
const pdf = require('pdf-parse');
const { MongoClient } = require('mongodb');
const { put } = require('@vercel/blob');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const PUBLIC = __dirname;

app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/styles', express.static(path.join(__dirname, 'styles')));
app.use('/services', express.static(path.join(__dirname, 'services')));

// Vercel serves public/ automatically. These routes keep the original clean URLs.
app.get('/', (req, res) => res.redirect('/consulta'));
app.get('/consulta', (req, res) => res.sendFile(path.join(PUBLIC, 'consulta.html')));
app.get('/panel', (req, res) => res.sendFile(path.join(PUBLIC, 'panel.html')));
app.get('/lunas', (req, res) => res.sendFile(path.join(PUBLIC, 'lunas.html')));
app.get('/permiso-lunas-polarizadas.html', (req, res) => res.sendFile(path.join(PUBLIC, 'permiso-lunas-polarizadas.html')));
app.get('/permiso-lunas-polarizadas-peru.html', (req, res) => res.sendFile(path.join(PUBLIC, 'permiso-lunas-polarizadas-peru.html')));
app.get('/sitemap.xml', (req, res) => res.sendFile(path.join(PUBLIC, 'sitemap.xml')));
app.get('/robots.txt', (req, res) => res.sendFile(path.join(PUBLIC, 'robots.txt')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

let mongoClient;
let mongoDb;

async function db() {
  if (mongoDb) return mongoDb;

  if (!process.env.MONGODB_URI) {
    throw new Error('Falta configurar MONGODB_URI en Vercel.');
  }

  mongoClient = new MongoClient(process.env.MONGODB_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 8000
  });

  await mongoClient.connect();

  mongoDb = mongoClient.db(
    process.env.MONGODB_DB || 'portal_lunas'
  );

  await mongoDb.collection('lunas').createIndex(
    { placa: 1 },
    { unique: true, sparse: true }
  );

  await mongoDb.collection('lunas').createIndex(
    { nro_certificado: 1 }
  );

  await mongoDb.collection('usuarios').createIndex(
    { usuario: 1 },
    { unique: true, sparse: true }
  );

  return mongoDb;
}

function tokenFor(user) {
  return jwt.sign(
    {
      id: user.id,
      usuario: user.usuario
    },
    process.env.JWT_SECRET || 'PORTAL_LUNAS_2026',
    {
      expiresIn: '8h'
    }
  );
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';

  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : '';

  if (!token) {
    return res.status(401).json({
      ok: false,
      mensaje: 'Token no proporcionado'
    });
  }

  try {
    req.usuario = jwt.verify(
      token,
      process.env.JWT_SECRET || 'PORTAL_LUNAS_2026'
    );

    next();
  } catch {
    return res.status(403).json({
      ok: false,
      mensaje: 'Token inválido'
    });
  }
}

async function ensureAdmin() {
  const user = process.env.ADMIN_USER;
  const password = process.env.ADMIN_PASSWORD;

  if (!user || !password) return;

  const database = await db();

  const exists = await database
    .collection('usuarios')
    .findOne({ usuario: user });

  if (!exists) {
    await database.collection('usuarios').insertOne({
      id: crypto.randomUUID(),
      usuario: user,
      nombre: process.env.ADMIN_NAME || 'Administrador',
      correo: process.env.ADMIN_EMAIL || '',
      rol: 'admin',
      estado: 1,
      password: await bcrypt.hash(password, 10),
      createdAt: new Date()
    });
  }
}

function dato(texto, patron) {
  const m = texto.match(patron);
  return m ? m[1].trim() : '';
}

function limpiar(valor) {
  return String(valor || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizarPlaca(valor) {
  return String(valor || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

/*
 * Extrae un campo del texto del PDF y se detiene cuando encuentra
 * cualquiera de las etiquetas siguientes, aunque estén en la misma línea.
 */
function extraerCampo(texto, campo) {
  const campos = [
    'Placa',
    'NRO',
    'Categoría',
    'Categoria',
    'Carrocería',
    'Carroceria',
    'Marca',
    'Modelo',
    'Color',
    'Motor',
    'Serie',
    'Año',
    'Fecha de Emisión',
    'Fecha Emisión'
  ];

  const escapar = valor =>
    valor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const campoEscapado = escapar(campo);

  const siguientes = campos
    .filter(
      c => c.toLowerCase() !== campo.toLowerCase()
    )
    .map(escapar)
    .join('|');

  const regex = new RegExp(
    campoEscapado +
    '\\s*:\\s*([\\s\\S]*?)(?=\\s+(?:' +
    siguientes +
    ')\\s*:|\\s*$)',
    'i'
  );

  const m = texto.match(regex);

  return m ? limpiar(m[1]) : '';
}

function extraerPlaca(texto) {
  const m = texto.match(
    /Placa\s*:\s*([A-Z0-9]{5,8})(?=\s|$)/i
  );

  return m
    ? normalizarPlaca(m[1])
    : '';
}

function limpiarPropietario(valor) {
  let propietario = limpiar(valor);

  propietario = propietario
    .replace(
      /\s*DATOS\s+DEL\s+VEH[IÍ]CULO\s*:?.*$/i,
      ''
    )
    .replace(
      /\s*DATOS\s+DEL\s+SOLICITANTE\s*:?.*$/i,
      ''
    )
    .replace(/\s{2,}/g, ' ')
    .trim();

  return propietario;
}

async function parsePdf(buffer) {
  const resultado = await pdf(buffer);

  const texto = resultado.text
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ');

  // PLACA: solamente el código de placa.
  // No toma textos como "(AUTENTICA-02)".
  const placa = extraerPlaca(texto);

  // NÚMERO DE CERTIFICADO.
  let nro_certificado = extraerCampo(
    texto,
    'NRO'
  ).toUpperCase();

  const certificadoMatch =
    nro_certificado.match(/[A-Z0-9]{5,20}/);

  nro_certificado = certificadoMatch
    ? certificadoMatch[0]
    : '';

  // PROPIETARIO.
  let propietario = dato(
    texto,
    /DATOS DEL SOLICITANTE[\s\S]*?\n\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .,'-]{3,})(?=\s*\n|$)/i
  );

  propietario = limpiarPropietario(propietario);

  if (!propietario) {
    propietario = limpiarPropietario(
      dato(
        texto,
        /PROPIETARIO\s*:\s*([^\n]+)/i
      )
    );
  }

  // DATOS DEL VEHÍCULO.
  const categoria =
    extraerCampo(texto, 'Categoría') ||
    extraerCampo(texto, 'Categoria');

  const marca =
    extraerCampo(texto, 'Marca');

  const modelo =
    extraerCampo(texto, 'Modelo');

  const color =
    extraerCampo(texto, 'Color');

  const motor =
    extraerCampo(texto, 'Motor');

  const serie =
    extraerCampo(texto, 'Serie');

  // AÑO: solamente cuatro dígitos.
  const anio = dato(
    texto,
    /Año\s*:\s*([0-9]{4})/i
  );

  // FECHA DE EMISIÓN.
  let fecha_emision = dato(
    texto,
    /Fecha\s*(?:de\s*)?Emisión\s*:\s*([0-9]{1,2}[\/-][0-9]{1,2}[\/-][0-9]{4})/i
  );

  if (!fecha_emision) {
    fecha_emision = new Date();
  }

  return {
    placa,
    numero_resolucion: '',
    fecha_resolucion: new Date(),
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
    video: '',
    descripcion: ''
  };
}

app.post('/api/login', async (req, res) => {
  try {
    await ensureAdmin();

    const database = await db();

    const {
      usuario,
      password
    } = req.body || {};

    const user = await database
      .collection('usuarios')
      .findOne({ usuario });

    if (
      !user ||
      !(await bcrypt.compare(
        password || '',
        user.password
      ))
    ) {
      return res.json({
        ok: false,
        mensaje: 'Usuario o contraseña incorrectos'
      });
    }

    return res.json({
      ok: true,
      mensaje: 'Bienvenido',
      token: tokenFor(user),
      usuario: {
        id: user.id,
        usuario: user.usuario,
        nombre: user.nombre
      }
    });

  } catch (e) {
    return res.status(500).json({
      ok: false,
      mensaje: e.message
    });
  }
});

// CONSULTA PÚBLICA
app.get(
  '/api/importar/consulta/:tipo/:valor',
  async (req, res) => {
    try {
      const database = await db();

      const tipo = req.params.tipo;
      const valor = String(
        req.params.valor || ''
      ).toUpperCase();

      let registro = null;

      if (tipo === 'placa') {

        const placaBuscada =
          normalizarPlaca(valor);

        // Primero busca el formato correcto.
        registro = await database
          .collection('lunas')
          .findOne(
            {
              placa: placaBuscada
            },
            {
              projection: {
                _id: 0
              }
            }
          );

        // Compatibilidad con registros antiguos
        // que hayan quedado con texto adicional.
        if (!registro && placaBuscada) {

          const escapedPlaca =
            placaBuscada.replace(
              /[.*+?^${}()|[\]\\]/g,
              '\\$&'
            );

          registro = await database
            .collection('lunas')
            .findOne(
              {
                placa: {
                  $regex:
                    `^${escapedPlaca}(?:\\s|\\(|$)`,
                  $options: 'i'
                }
              },
              {
                projection: {
                  _id: 0
                }
              }
            );
        }

      } else if (tipo === 'certificado') {

        registro = await database
          .collection('lunas')
          .findOne(
            {
              nro_certificado: valor
            },
            {
              projection: {
                _id: 0
              }
            }
          );

      } else {

        return res.json({
          ok: false,
          mensaje: 'Tipo de búsqueda no válido.'
        });
      }

      if (!registro) {
        return res.json({
          ok: false,
          mensaje: 'No se encontró ningún registro.'
        });
      }

      return res.json({
        ok: true,
        registro
      });

    } catch (e) {
      return res.status(500).json({
        ok: false,
        mensaje: e.message
      });
    }
  }
);

app.get(
  '/api/importar/lunas',
  auth,
  async (req, res) => {
    try {
      const database = await db();

      const rows =
        await database
          .collection('lunas')
          .find(
            {},
            {
              projection: {
                _id: 0
              }
            }
          )
          .sort({
            createdAt: -1
          })
          .toArray();

      res.json(rows);

    } catch (e) {
      res.status(500).json({
        ok: false,
        mensaje: e.message
      });
    }
  }
);

app.post(
  '/api/importar/excel',
  auth,
  upload.single('archivo'),
  async (req, res) => {
    try {

      if (!req.file) {
        return res.status(400).json({
          ok: false,
          mensaje: 'No se recibió ningún archivo Excel'
        });
      }

      const libro =
        xlsx.read(req.file.buffer);

      const hoja =
        libro.Sheets[
          libro.SheetNames[0]
        ];

      const datos =
        xlsx.utils.sheet_to_json(
          hoja
        );

      res.json({
        ok: true,
        total: datos.length,
        registros: datos
      });

    } catch (e) {
      res.status(500).json({
        ok: false,
        mensaje: e.message
      });
    }
  }
);

app.post(
  '/api/importar/pdf',
  auth,
  upload.single('archivo'),
  async (req, res) => {
    try {

      if (!req.file) {
        return res.status(400).json({
          ok: false,
          mensaje: 'No se recibió ningún PDF'
        });
      }

      const registro =
        await parsePdf(
          req.file.buffer
        );

      if (!registro.placa) {
        return res.status(400).json({
          ok: false,
          mensaje:
            'No se pudo extraer la placa del PDF.'
        });
      }

      const safeName =
        `${registro.placa}-${Date.now()}.pdf`
          .replace(
            /[^A-Z0-9_.-]/gi,
            '_'
          );

      const blob =
        await put(
          `pdf/${safeName}`,
          req.file.buffer,
          {
            access: 'public',
            contentType: 'application/pdf',
            addRandomSuffix: false
          }
        );

      registro.archivo_pdf =
        blob.url;

      registro.id =
        crypto.randomUUID();

      registro.createdAt =
        new Date();

      const database =
        await db();

      const existing =
        await database
          .collection('lunas')
          .findOne({
            placa: registro.placa
          });

      if (existing) {

        registro.id =
          existing.id ||
          registro.id;

        registro.createdAt =
          existing.createdAt ||
          registro.createdAt;
      }

      await database
        .collection('lunas')
        .replaceOne(
          {
            placa: registro.placa
          },
          registro,
          {
            upsert: true
          }
        );

      res.json({
        ok: true,
        mensaje:
          'PDF importado correctamente',
        placa: registro.placa,
        propietario:
          registro.propietario,
        certificado:
          registro.nro_certificado
      });

    } catch (e) {
      res.status(500).json({
        ok: false,
        mensaje: e.message
      });
    }
  }
);

app.put(
  '/api/importar/lunas/:id',
  auth,
  async (req, res) => {
    try {

      const database =
        await db();

      const fields = [
        'placa',
        'propietario',
        'nro_certificado',
        'categoria',
        'marca',
        'modelo',
        'color',
        'motor',
        'serie',
        'anio'
      ];

      const update = {};

      for (const f of fields) {
        update[f] =
          req.body?.[f] ?? '';
      }

      const result =
        await database
          .collection('lunas')
          .updateOne(
            {
              id: req.params.id
            },
            {
              $set: update
            }
          );

      if (!result.matchedCount) {
        return res.status(404).json({
          ok: false,
          mensaje:
            'Registro no encontrado'
        });
      }

      res.json({
        ok: true,
        mensaje:
          'Registro actualizado correctamente'
      });

    } catch (e) {
      res.status(500).json({
        ok: false,
        mensaje: e.message
      });
    }
  }
);

app.delete(
  '/api/importar/lunas/:id',
  auth,
  async (req, res) => {
    try {

      const database =
        await db();

      const result =
        await database
          .collection('lunas')
          .deleteOne({
            id: req.params.id
          });

      if (!result.deletedCount) {
        return res.status(404).json({
          ok: false,
          mensaje:
            'Registro no encontrado'
        });
      }

      res.json({
        ok: true,
        mensaje:
          'Registro eliminado correctamente'
      });

    } catch (e) {
      res.status(500).json({
        ok: false,
        mensaje: e.message
      });
    }
  }
);

app.get(
  '/api/usuarios',
  auth,
  async (req, res) => {
    try {

      const database =
        await db();

      const usuarios =
        await database
          .collection('usuarios')
          .find(
            {},
            {
              projection: {
                _id: 0,
                password: 0
              }
            }
          )
          .sort({
            createdAt: -1
          })
          .toArray();

      res.json({
        ok: true,
        usuarios
      });

    } catch (e) {
      res.status(500).json({
        ok: false,
        mensaje: e.message
      });
    }
  }
);

app.post(
  '/api/usuarios',
  auth,
  async (req, res) => {
    try {

      const database =
        await db();

      const {
        usuario,
        nombre,
        password
      } = req.body || {};

      if (!usuario || !password) {
        return res.status(400).json({
          ok: false,
          mensaje:
            'Usuario y contraseña son obligatorios'
        });
      }

      await database
        .collection('usuarios')
        .insertOne({
          id: crypto.randomUUID(),
          usuario,
          nombre: nombre || '',
          correo: '',
          rol: 'admin',
          estado: 1,
          password:
            await bcrypt.hash(
              password,
              10
            ),
          createdAt:
            new Date()
        });

      res.json({
        ok: true,
        mensaje:
          'Usuario creado correctamente'
      });

    } catch (e) {
      res.status(500).json({
        ok: false,
        mensaje:
          e.code === 11000
            ? 'El usuario ya existe'
            : e.message
      });
    }
  }
);

app.put(
  '/api/usuarios/:id',
  auth,
  async (req, res) => {
    try {

      const database =
        await db();

      const {
        usuario,
        nombre,
        password
      } = req.body || {};

      const update = {
        usuario,
        nombre
      };

      if (password) {
        update.password =
          await bcrypt.hash(
            password,
            10
          );
      }

      const result =
        await database
          .collection('usuarios')
          .updateOne(
            {
              id: req.params.id
            },
            {
              $set: update
            }
          );

      if (!result.matchedCount) {
        return res.status(404).json({
          ok: false,
          mensaje:
            'Usuario no encontrado'
        });
      }

      res.json({
        ok: true,
        mensaje:
          'Usuario actualizado correctamente'
      });

    } catch (e) {
      res.status(500).json({
        ok: false,
        mensaje:
          e.code === 11000
            ? 'El usuario ya existe'
            : e.message
      });
    }
  }
);

app.delete(
  '/api/usuarios/:id',
  auth,
  async (req, res) => {
    try {

      const database =
        await db();

      if (
        req.params.id ===
        req.usuario.id
      ) {
        return res.status(400).json({
          ok: false,
          mensaje:
            'No puede eliminar su propio usuario'
        });
      }

      const result =
        await database
          .collection('usuarios')
          .deleteOne({
            id: req.params.id
          });

      if (!result.deletedCount) {
        return res.status(404).json({
          ok: false,
          mensaje:
            'Usuario no encontrado'
        });
      }

      res.json({
        ok: true,
        mensaje:
          'Usuario eliminado correctamente'
      });

    } catch (e) {
      res.status(500).json({
        ok: false,
        mensaje: e.message
      });
    }
  }
);

app.get(
  '/api/health',
  async (req, res) => {
    try {

      const database =
        await db();

      await database.command({
        ping: 1
      });

      res.json({
        ok: true,
        servicio:
          'portal-lunas',
        baseDatos:
          'MongoDB'
      });

    } catch (e) {
      res.status(500).json({
        ok: false,
        mensaje:
          e.message
      });
    }
  }
);

app.use(
  (err, req, res, next) => {
    console.error(err);

    res.status(500).json({
      ok: false,
      mensaje:
        'Error interno del servidor'
    });
  }
);

module.exports = app;

if (require.main === module) {
  const port =
    process.env.PORT || 3000;

  app.listen(
    port,
    '0.0.0.0',
    () =>
      console.log(
        `Portal corriendo en puerto ${port}`
      )
  );
}
