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

app.use(express.json({
    limit: '2mb'
}));

const PUBLIC = __dirname;


/*
|--------------------------------------------------------------------------
| ARCHIVOS ESTÁTICOS
|--------------------------------------------------------------------------
*/

app.use(
    '/assets',
    express.static(
        path.join(__dirname, 'assets')
    )
);

app.use(
    '/styles',
    express.static(
        path.join(__dirname, 'styles')
    )
);

app.use(
    '/services',
    express.static(
        path.join(__dirname, 'services')
    )
);


/*
|--------------------------------------------------------------------------
| RUTAS PRINCIPALES
|--------------------------------------------------------------------------
*/

app.get('/', (req, res) => {
    res.redirect('/consulta');
});

app.get('/consulta', (req, res) => {
    res.sendFile(
        path.join(__dirname, 'consulta.html')
    );
});

app.get('/panel', (req, res) => {
    res.sendFile(
        path.join(__dirname, 'panel.html'),
        (err) => {
            if (err) {
                console.error('ERROR CARGANDO PANEL:', err);

                if (!res.headersSent) {
                    res.status(500).send(
                        'No se pudo cargar el panel de administración.'
                    );
                }
            }
        }
    );
});

app.get(
    '/permiso-lunas-polarizadas.html',
    (req, res) => {
        res.sendFile(
            path.join(
                PUBLIC,
                'permiso-lunas-polarizadas.html'
            )
        );
    }
);

app.get(
    '/permiso-lunas-polarizadas-peru.html',
    (req, res) => {
        res.sendFile(
            path.join(
                PUBLIC,
                'permiso-lunas-polarizadas-peru.html'
            )
        );
    }
);

app.get('/sitemap.xml', (req, res) => {
    res.sendFile(
        path.join(PUBLIC, 'sitemap.xml')
    );
});

app.get('/robots.txt', (req, res) => {
    res.sendFile(
        path.join(PUBLIC, 'robots.txt')
    );
});


/*
|--------------------------------------------------------------------------
| SUBIDA DE ARCHIVOS
|--------------------------------------------------------------------------
*/

const upload = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 20 * 1024 * 1024
    }
});


/*
|--------------------------------------------------------------------------
| MONGODB
|--------------------------------------------------------------------------
*/

let mongoClient;
let mongoDb;

async function db() {

    if (mongoDb) {
        return mongoDb;
    }

    if (!process.env.MONGODB_URI) {
        throw new Error(
            'Falta configurar MONGODB_URI en Vercel.'
        );
    }

    mongoClient = new MongoClient(
        process.env.MONGODB_URI,
        {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 8000
        }
    );

    await mongoClient.connect();

    mongoDb = mongoClient.db(
        process.env.MONGODB_DB ||
        'portal_lunas'
    );

    await mongoDb
        .collection('lunas')
        .createIndex(
            { placa: 1 },
            {
                unique: true,
                sparse: true
            }
        );

    await mongoDb
        .collection('lunas')
        .createIndex({
            nro_certificado: 1
        });

    await mongoDb
        .collection('usuarios')
        .createIndex(
            { usuario: 1 },
            {
                unique: true,
                sparse: true
            }
        );

    return mongoDb;
}


/*
|--------------------------------------------------------------------------
| JWT
|--------------------------------------------------------------------------
*/

function tokenFor(user) {

    return jwt.sign(
        {
            id: user.id,
            usuario: user.usuario
        },

        process.env.JWT_SECRET ||
        'PORTAL_LUNAS_2026',

        {
            expiresIn: '8h'
        }
    );
}


/*
|--------------------------------------------------------------------------
| AUTENTICACIÓN
|--------------------------------------------------------------------------
*/

function auth(req, res, next) {

    const header =
        req.headers.authorization || '';

    const token =
        header.startsWith('Bearer ')
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
            process.env.JWT_SECRET ||
            'PORTAL_LUNAS_2026'
        );

        next();

    } catch {

        return res.status(403).json({
            ok: false,
            mensaje: 'Token inválido'
        });
    }
}


/*
|--------------------------------------------------------------------------
| CREAR ADMINISTRADOR AUTOMÁTICAMENTE
|--------------------------------------------------------------------------
*/

async function ensureAdmin() {

    const user =
        process.env.ADMIN_USER;

    const password =
        process.env.ADMIN_PASSWORD;

    if (!user || !password) {
        return;
    }

    const database =
        await db();

    const exists =
        await database
            .collection('usuarios')
            .findOne({
                usuario: user
            });

    if (!exists) {

        await database
            .collection('usuarios')
            .insertOne({

                id: crypto.randomUUID(),

                usuario: user,

                nombre:
                    process.env.ADMIN_NAME ||
                    'Administrador',

                correo:
                    process.env.ADMIN_EMAIL ||
                    '',

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
    }
}


/*
|--------------------------------------------------------------------------
| FUNCIONES AUXILIARES
|--------------------------------------------------------------------------
*/

function dato(texto, patron) {

    const m =
        texto.match(patron);

    return m
        ? m[1].trim()
        : '';
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
|--------------------------------------------------------------------------
| ESCAPAR TEXTO PARA REGEX
|--------------------------------------------------------------------------
*/

function escaparRegex(valor) {

    return String(valor)
        .replace(
            /[.*+?^${}()|[\]\\]/g,
            '\\$&'
        );
}


/*
|--------------------------------------------------------------------------
| EXTRAER CAMPOS DEL PDF
|--------------------------------------------------------------------------
*/

function extraerCampo(texto, campo) {

    const campos = [
        'Placa',
        'NRO',
        'Nro',
        'NRO Certificado',
        'Nro Certificado',
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
        'Fecha Emisión',
        'Fecha de emision',
        'Fecha emision'
    ];

    const campoEscapado =
        escaparRegex(campo);

    const siguientes =
        campos
            .filter(
                c =>
                    c.toLowerCase() !==
                    campo.toLowerCase()
            )
            .map(escaparRegex)
            .join('|');

    const regex =
        new RegExp(
            campoEscapado +
            '\\s*:\\s*' +
            '([\\s\\S]*?)' +
            '(?=' +
                '\\s+(?:' +
                    siguientes +
                ')\\s*:' +
                '|\\s+OBSERVACI[ÓO]N\\b' +
                '|\\s+RESPONSABLE\\b' +
                '|\\s+DATOS\\s+DEL\\s+VEH[IÍ]CULO\\b' +
                '|\\s+DATOS\\s+DEL\\s+SOLICITANTE\\b' +
                '|$)',
            'i'
        );

    const m =
        texto.match(regex);

    if (!m) {
        return '';
    }

    return limpiar(
        m[1]
            .replace(/[-_=]{2,}/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
    );
}


/*
|--------------------------------------------------------------------------
| PLACA
|--------------------------------------------------------------------------
*/

function extraerPlaca(texto) {

    let m =
        texto.match(
            /Placa\s*:\s*([A-Z0-9]{5,8})(?=\s|$)/i
        );

    if (m) {

        return normalizarPlaca(
            m[1]
        );
    }

    m =
        texto.match(
            /Placa\s*:\s*([A-Z0-9][A-Z0-9\s-]{4,10})/i
        );

    if (m) {

        const candidata =
            m[1]
                .replace(
                    /[\s-]/g,
                    ''
                );

        return normalizarPlaca(
            candidata
        );
    }

    return '';
}


/*
|--------------------------------------------------------------------------
| LIMPIAR PROPIETARIO
|--------------------------------------------------------------------------
*/

function limpiarPropietario(valor) {

    let propietario =
        limpiar(valor);

    propietario =
        propietario.replace(
            /\s*DATOS\s+DEL\s+VEH[IÍ]CULO\s*:?.*$/i,
            ''
        );

    propietario =
        propietario.replace(
            /\s*DATOS\s+DEL\s+SOLICITANTE\s*:?.*$/i,
            ''
        );

    propietario =
        propietario.replace(
            /\s*PLACA\s*:?.*$/i,
            ''
        );

    propietario =
        propietario
            .replace(/\s{2,}/g, ' ')
            .trim();

    return propietario;
}


/*
|--------------------------------------------------------------------------
| PARSER PRINCIPAL DEL PDF
|--------------------------------------------------------------------------
*/

async function parsePdf(buffer) {

    const resultado =
        await pdf(buffer);

    const texto =
        resultado.text
            .replace(/\r/g, '')
            .replace(/\u00a0/g, ' ');


/*
|--------------------------------------------------------------------------
| PLACA
|--------------------------------------------------------------------------
*/

    const placa =
        extraerPlaca(texto);


/*
|--------------------------------------------------------------------------
| NÚMERO DE CERTIFICADO
|--------------------------------------------------------------------------
*/

    let nro_certificado =
        extraerCampo(
            texto,
            'NRO'
        ).toUpperCase();

    const certificadoMatch =
        nro_certificado.match(
            /[A-Z0-9]{5,20}/
        );

    nro_certificado =
        certificadoMatch
            ? certificadoMatch[0]
            : '';


/*
|--------------------------------------------------------------------------
| PROPIETARIO
|--------------------------------------------------------------------------
*/

    let propietario =
        dato(
            texto,
            /DATOS DEL SOLICITANTE[\s\S]*?\n\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .,'-]{3,})(?=\s*\n|$)/i
        );

    propietario =
        limpiarPropietario(
            propietario
        );

    if (!propietario) {

        propietario =
            limpiarPropietario(
                dato(
                    texto,
                    /PROPIETARIO\s*:\s*([^\n]+)/i
                )
            );
    }


/*
|--------------------------------------------------------------------------
| DATOS DEL VEHÍCULO
|--------------------------------------------------------------------------
*/

    let categoria =
        extraerCampo(
            texto,
            'Categoría'
        );

    if (!categoria) {

        categoria =
            extraerCampo(
                texto,
                'Categoria'
            );
    }

    const marca =
        extraerCampo(
            texto,
            'Marca'
        );

    const modelo =
        extraerCampo(
            texto,
            'Modelo'
        );

    const color =
        extraerCampo(
            texto,
            'Color'
        );

    const motor =
        extraerCampo(
            texto,
            'Motor'
        );

    const serie =
        extraerCampo(
            texto,
            'Serie'
        );


/*
|--------------------------------------------------------------------------
| AÑO
|--------------------------------------------------------------------------
*/

    let anio =
        dato(
            texto,
            /Año\s*:\s*([0-9]{4})/i
        );


/*
|--------------------------------------------------------------------------
| FECHA DE EMISIÓN
|--------------------------------------------------------------------------
|
| IMPORTANTE:
|
| La fecha sale EXCLUSIVAMENTE del PDF.
|
| Ya NO usamos new Date() como sustituto.
|
|--------------------------------------------------------------------------
*/

    let fecha_emision =
        dato(
            texto,
            /Fecha\s*(?:de\s*)?Emisión\s*:\s*([0-9]{1,2}[\/-][0-9]{1,2}[\/-][0-9]{4})/i
        );


/*
|--------------------------------------------------------------------------
| SEGUNDO MÉTODO PARA FECHA
|--------------------------------------------------------------------------
|
| Algunos PDF pueden separar "Fecha" y "Emisión"
| de manera diferente.
|
|--------------------------------------------------------------------------
*/

    if (!fecha_emision) {

        fecha_emision =
            dato(
                texto,
                /Fecha\s+Emisión\s*:\s*([0-9]{1,2}[\/-][0-9]{1,2}[\/-][0-9]{4})/i
            );
    }


/*
|--------------------------------------------------------------------------
| SI NO HAY FECHA EN EL PDF
|--------------------------------------------------------------------------
|
| NO inventamos la fecha actual.
|
|--------------------------------------------------------------------------
*/

    if (!fecha_emision) {

        throw new Error(
            'No se encontró la Fecha de Emisión en el PDF.'
        );
    }


/*
|--------------------------------------------------------------------------
| NORMALIZAR FECHA
|--------------------------------------------------------------------------
*/

    const fechaMatch =
        fecha_emision.match(
            /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/
        );

    if (fechaMatch) {

        const dia =
            fechaMatch[1].padStart(2, '0');

        const mes =
            fechaMatch[2].padStart(2, '0');

        const anioFecha =
            fechaMatch[3];

        fecha_emision =
            `${dia}/${mes}/${anioFecha}`;
    }


/*
|--------------------------------------------------------------------------
| RESULTADO FINAL
|--------------------------------------------------------------------------
*/

    return {

        placa,

        numero_resolucion:
            '',

        fecha_resolucion:
            '',

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

        video:
            '',

        descripcion:
            ''
    };
}
/*
|--------------------------------------------------------------------------
| LOGIN
|--------------------------------------------------------------------------
*/

app.post(
    '/api/login',
    async (req, res) => {

        try {

            await ensureAdmin();

            const database =
                await db();

            const {
                usuario,
                password
            } = req.body || {};

            const user =
                await database
                    .collection('usuarios')
                    .findOne({
                        usuario
                    });

            if (
                !user ||
                !(
                    await bcrypt.compare(
                        password || '',
                        user.password
                    )
                )
            ) {

                return res.json({

                    ok: false,

                    mensaje:
                        'Usuario o contraseña incorrectos'
                });
            }

            return res.json({

                ok: true,

                mensaje:
                    'Bienvenido',

                token:
                    tokenFor(user),

                usuario: {

                    id:
                        user.id,

                    usuario:
                        user.usuario,

                    nombre:
                        user.nombre
                }
            });

        } catch (e) {

            return res.status(500).json({

                ok: false,

                mensaje:
                    e.message
            });
        }
    }
);


/*
|--------------------------------------------------------------------------
| CONSULTA PÚBLICA
|--------------------------------------------------------------------------
*/

app.get(
    '/api/importar/consulta/:tipo/:valor',
    async (req, res) => {

        try {

            const database =
                await db();

            const tipo =
                String(
                    req.params.tipo || ''
                ).toLowerCase();

            const valor =
                String(
                    req.params.valor || ''
                )
                    .toUpperCase()
                    .trim();

            let registro = null;


/*
|--------------------------------------------------------------------------
| BUSCAR POR PLACA
|--------------------------------------------------------------------------
*/

            if (tipo === 'placa') {

                const placaBuscada =
                    normalizarPlaca(valor);

                registro =
                    await database
                        .collection('lunas')
                        .findOne(
                            {
                                placa:
                                    placaBuscada
                            },
                            {
                                projection: {
                                    _id: 0
                                }
                            }
                        );


/*
|--------------------------------------------------------------------------
| COMPATIBILIDAD CON REGISTROS ANTIGUOS
|--------------------------------------------------------------------------
*/

                if (
                    !registro &&
                    placaBuscada
                ) {

                    const escapedPlaca =
                        placaBuscada.replace(
                            /[.*+?^${}()|[\]\\]/g,
                            '\\$&'
                        );

                    registro =
                        await database
                            .collection('lunas')
                            .findOne(
                                {
                                    placa: {
                                        $regex:
                                            `^${escapedPlaca}(?:\\s|\\(|$)`,

                                        $options:
                                            'i'
                                    }
                                },
                                {
                                    projection: {
                                        _id: 0
                                    }
                                }
                            );
                }


/*
|--------------------------------------------------------------------------
| BUSCAR POR CERTIFICADO
|--------------------------------------------------------------------------
*/

            } else if (
                tipo === 'certificado'
            ) {

                registro =
                    await database
                        .collection('lunas')
                        .findOne(
                            {
                                nro_certificado:
                                    valor
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

                    mensaje:
                        'Tipo de búsqueda no válido.'
                });
            }


/*
|--------------------------------------------------------------------------
| NO ENCONTRADO
|--------------------------------------------------------------------------
*/

            if (!registro) {

                return res.json({

                    ok: false,

                    mensaje:
                        'No se encontró ningún registro.'
                });
            }


/*
|--------------------------------------------------------------------------
| DEVOLVER REGISTRO
|--------------------------------------------------------------------------
*/

            return res.json({

                ok: true,

                registro
            });

        } catch (e) {

            return res.status(500).json({

                ok: false,

                mensaje:
                    e.message
            });
        }
    }
);


/*
|--------------------------------------------------------------------------
| LISTAR LUNAS
|--------------------------------------------------------------------------
*/

app.get(
    '/api/importar/lunas',
    auth,
    async (req, res) => {

        try {

            const database =
                await db();

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

                mensaje:
                    e.message
            });
        }
    }
);


/*
|--------------------------------------------------------------------------
| IMPORTAR EXCEL
|--------------------------------------------------------------------------
*/

app.post(
    '/api/importar/excel',
    auth,
    upload.single('archivo'),

    async (req, res) => {

        try {

            if (!req.file) {

                return res.status(400).json({

                    ok: false,

                    mensaje:
                        'No se recibió ningún archivo Excel'
                });
            }

            const libro =
                xlsx.read(
                    req.file.buffer
                );

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

                total:
                    datos.length,

                registros:
                    datos
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


/*
|--------------------------------------------------------------------------
| IMPORTAR PDF
|--------------------------------------------------------------------------
*/

app.post(
    '/api/importar/pdf',
    auth,
    upload.single('archivo'),

    async (req, res) => {

        try {


/*
|--------------------------------------------------------------------------
| VERIFICAR ARCHIVO
|--------------------------------------------------------------------------
*/

            if (!req.file) {

                return res.status(400).json({

                    ok: false,

                    mensaje:
                        'No se recibió ningún PDF'
                });
            }


/*
|--------------------------------------------------------------------------
| VERIFICAR QUE REALMENTE SEA PDF
|--------------------------------------------------------------------------
*/

            const nombre =
                String(
                    req.file.originalname || ''
                ).toLowerCase();

            const mime =
                String(
                    req.file.mimetype || ''
                ).toLowerCase();

            if (
                !nombre.endsWith('.pdf') &&
                mime !== 'application/pdf'
            ) {

                return res.status(400).json({

                    ok: false,

                    mensaje:
                        'El archivo debe ser un PDF.'
                });
            }


/*
|--------------------------------------------------------------------------
| EXTRAER DATOS DEL PDF
|--------------------------------------------------------------------------
*/

            const registro =
                await parsePdf(
                    req.file.buffer
                );


/*
|--------------------------------------------------------------------------
| LA PLACA ES OBLIGATORIA
|--------------------------------------------------------------------------
*/

            if (!registro.placa) {

                return res.status(400).json({

                    ok: false,

                    mensaje:
                        'No se pudo extraer la placa del PDF.'
                });
            }


/*
|--------------------------------------------------------------------------
| LA FECHA DE EMISIÓN ES OBLIGATORIA
|--------------------------------------------------------------------------
*/

            if (!registro.fecha_emision) {

                return res.status(400).json({

                    ok: false,

                    mensaje:
                        'No se pudo extraer la Fecha de Emisión del PDF.'
                });
            }


/*
|--------------------------------------------------------------------------
| NOMBRE SEGURO PARA VERCEL BLOB
|--------------------------------------------------------------------------
*/

            const safeName =
                `${registro.placa}-${Date.now()}.pdf`
                    .replace(
                        /[^A-Z0-9_.-]/gi,
                        '_'
                    );


/*
|--------------------------------------------------------------------------
| SUBIR PDF A VERCEL BLOB
|--------------------------------------------------------------------------
*/

            const blob =
                await put(
                    `pdf/${safeName}`,

                    req.file.buffer,

                    {
                        access:
                            'public',

                        contentType:
                            'application/pdf',

                        addRandomSuffix:
                            false
                    }
                );


/*
|--------------------------------------------------------------------------
| GUARDAR URL PERMANENTE DEL PDF
|--------------------------------------------------------------------------
*/

            registro.archivo_pdf =
                blob.url;


/*
|--------------------------------------------------------------------------
| ID DEL REGISTRO
|--------------------------------------------------------------------------
*/

            registro.id =
                crypto.randomUUID();


/*
|--------------------------------------------------------------------------
| FECHA INTERNA DE CREACIÓN
|--------------------------------------------------------------------------
|
| IMPORTANTE:
|
| createdAt solamente indica cuándo se cargó
| el registro al sistema.
|
| NO modifica fecha_emision.
|
|--------------------------------------------------------------------------
*/

            registro.createdAt =
                new Date();


/*
|--------------------------------------------------------------------------
| CONECTAR MONGODB
|--------------------------------------------------------------------------
*/

            const database =
                await db();


/*
|--------------------------------------------------------------------------
| REVISAR SI LA PLACA YA EXISTE
|--------------------------------------------------------------------------
*/

            const existing =
                await database
                    .collection('lunas')
                    .findOne({
                        placa:
                            registro.placa
                    });


/*
|--------------------------------------------------------------------------
| SI YA EXISTE, CONSERVAR ID Y FECHA INTERNA
|--------------------------------------------------------------------------
*/

            if (existing) {

                registro.id =
                    existing.id ||
                    registro.id;

                registro.createdAt =
                    existing.createdAt ||
                    registro.createdAt;
            }


/*
|--------------------------------------------------------------------------
| GUARDAR / ACTUALIZAR
|--------------------------------------------------------------------------
*/

            await database
                .collection('lunas')
                .replaceOne(

                    {
                        placa:
                            registro.placa
                    },

                    registro,

                    {
                        upsert:
                            true
                    }
                );


/*
|--------------------------------------------------------------------------
| RESPUESTA
|--------------------------------------------------------------------------
*/

            return res.json({

                ok: true,

                mensaje:
                    'PDF importado correctamente',

                placa:
                    registro.placa,

                propietario:
                    registro.propietario,

                certificado:
                    registro.nro_certificado,

                fecha_emision:
                    registro.fecha_emision,

                archivo_pdf:
                    registro.archivo_pdf
            });

        } catch (e) {

            console.error(
                'ERROR IMPORTANDO PDF:',
                e
            );

            return res.status(500).json({

                ok: false,

                mensaje:
                    e.message
            });
        }
    }
);


/*
|--------------------------------------------------------------------------
| ACTUALIZAR REGISTRO DE LUNAS
|--------------------------------------------------------------------------
*/

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

                'anio',

                'fecha_emision'
            ];

            const update = {};

            for (
                const f of fields
            ) {

                update[f] =
                    req.body?.[f] ?? '';
            }


/*
|--------------------------------------------------------------------------
| NORMALIZAR PLACA
|--------------------------------------------------------------------------
*/

            if (update.placa) {

                update.placa =
                    normalizarPlaca(
                        update.placa
                    );
            }


/*
|--------------------------------------------------------------------------
| LIMPIAR CAMPOS DE TEXTO
|--------------------------------------------------------------------------
*/

            for (
                const f of [

                    'propietario',

                    'nro_certificado',

                    'categoria',

                    'marca',

                    'modelo',

                    'color',

                    'motor',

                    'serie',

                    'anio',

                    'fecha_emision'

                ]
            ) {

                if (
                    typeof update[f] ===
                    'string'
                ) {

                    update[f] =
                        limpiar(
                            update[f]
                        );
                }
            }


/*
|--------------------------------------------------------------------------
| ACTUALIZAR
|--------------------------------------------------------------------------
*/

            const result =
                await database
                    .collection('lunas')
                    .updateOne(

                        {
                            id:
                                req.params.id
                        },

                        {
                            $set:
                                update
                        }
                    );


            if (
                !result.matchedCount
            ) {

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

                mensaje:
                    e.message
            });
        }
    }
);
/*
|--------------------------------------------------------------------------
| ELIMINAR REGISTRO
|--------------------------------------------------------------------------
*/

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

                        id:
                            req.params.id
                    });


            if (
                !result.deletedCount
            ) {

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

                mensaje:
                    e.message
            });
        }
    }
);


/*
|--------------------------------------------------------------------------
| USUARIOS
|--------------------------------------------------------------------------
*/

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

            return res.json({

                ok: true,

                usuarios
            });

        } catch (e) {

            return res.status(500).json({

                ok: false,

                mensaje:
                    e.message
            });
        }
    }
);


/*
|--------------------------------------------------------------------------
| CREAR USUARIO
|--------------------------------------------------------------------------
*/

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

            if (
                !usuario ||
                !password
            ) {

                return res.status(400).json({

                    ok: false,

                    mensaje:
                        'Usuario y contraseña son obligatorios'
                });
            }

            await database
                .collection('usuarios')
                .insertOne({

                    id:
                        crypto.randomUUID(),

                    usuario:
                        String(usuario).trim(),

                    nombre:
                        String(nombre || '').trim(),

                    correo:
                        '',

                    rol:
                        'admin',

                    estado:
                        1,

                    password:
                        await bcrypt.hash(
                            password,
                            10
                        ),

                    createdAt:
                        new Date()
                });

            return res.json({

                ok: true,

                mensaje:
                    'Usuario creado correctamente'
            });

        } catch (e) {

            return res.status(500).json({

                ok: false,

                mensaje:
                    e.code === 11000
                        ? 'El usuario ya existe'
                        : e.message
            });
        }
    }
);


/*
|--------------------------------------------------------------------------
| ACTUALIZAR USUARIO
|--------------------------------------------------------------------------
*/

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

                usuario:
                    String(usuario || '').trim(),

                nombre:
                    String(nombre || '').trim()
            };


/*
|--------------------------------------------------------------------------
| CAMBIAR CONTRASEÑA SI SE PROPORCIONA
|--------------------------------------------------------------------------
*/

            if (password) {

                update.password =
                    await bcrypt.hash(
                        password,
                        10
                    );
            }


/*
|--------------------------------------------------------------------------
| ACTUALIZAR
|--------------------------------------------------------------------------
*/

            const result =
                await database
                    .collection('usuarios')
                    .updateOne(

                        {
                            id:
                                req.params.id
                        },

                        {
                            $set:
                                update
                        }
                    );


            if (
                !result.matchedCount
            ) {

                return res.status(404).json({

                    ok: false,

                    mensaje:
                        'Usuario no encontrado'
                });
            }

            return res.json({

                ok: true,

                mensaje:
                    'Usuario actualizado correctamente'
            });

        } catch (e) {

            return res.status(500).json({

                ok: false,

                mensaje:
                    e.code === 11000
                        ? 'El usuario ya existe'
                        : e.message
            });
        }
    }
);


/*
|--------------------------------------------------------------------------
| ELIMINAR USUARIO
|--------------------------------------------------------------------------
*/

app.delete(
    '/api/usuarios/:id',
    auth,

    async (req, res) => {

        try {

            const database =
                await db();


/*
|--------------------------------------------------------------------------
| EVITAR QUE EL ADMINISTRADOR SE ELIMINE A SÍ MISMO
|--------------------------------------------------------------------------
*/

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

                        id:
                            req.params.id
                    });


            if (
                !result.deletedCount
            ) {

                return res.status(404).json({

                    ok: false,

                    mensaje:
                        'Usuario no encontrado'
                });
            }

            return res.json({

                ok: true,

                mensaje:
                    'Usuario eliminado correctamente'
            });

        } catch (e) {

            return res.status(500).json({

                ok: false,

                mensaje:
                    e.message
            });
        }
    }
);


/*
|--------------------------------------------------------------------------
| HEALTH CHECK
|--------------------------------------------------------------------------
*/

app.get(
    '/api/health',

    async (req, res) => {

        try {

            const database =
                await db();

            await database.command({
                ping: 1
            });

            return res.json({

                ok: true,

                servicio:
                    'portal-lunas',

                baseDatos:
                    'MongoDB'
            });

        } catch (e) {

            return res.status(500).json({

                ok: false,

                mensaje:
                    e.message
            });
        }
    }
);


/*
|--------------------------------------------------------------------------
| MANEJO GLOBAL DE ERRORES
|--------------------------------------------------------------------------
*/

app.use(
    (err, req, res, next) => {

        console.error(
            'ERROR DEL SERVIDOR:',
            err
        );

        if (
            res.headersSent
        ) {

            return next(err);
        }

        return res.status(500).json({

            ok: false,

            mensaje:
                'Error interno del servidor'
        });
    }
);


/*
|--------------------------------------------------------------------------
| EXPORTAR APP PARA VERCEL
|--------------------------------------------------------------------------
*/

module.exports = app;


/*
|--------------------------------------------------------------------------
| SERVIDOR LOCAL
|--------------------------------------------------------------------------
*/

if (
    require.main === module
) {

    const port =
        process.env.PORT || 3000;

    app.listen(
        port,
        '0.0.0.0',
        () => {

            console.log(
                `Portal corriendo en puerto ${port}`
            );
        }
    );
}
