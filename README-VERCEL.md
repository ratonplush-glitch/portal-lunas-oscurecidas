# Portal de Consultas de Lunas Oscurecidas — Vercel

Esta versión está preparada para Vercel + MongoDB Atlas + Vercel Blob.

## Variables de entorno en Vercel

- `MONGODB_URI` = cadena de conexión de MongoDB Atlas
- `MONGODB_DB` = `portal_lunas`
- `JWT_SECRET` = una clave larga y privada
- `ADMIN_USER` = usuario administrador inicial
- `ADMIN_PASSWORD` = contraseña administrador inicial
- `ADMIN_NAME` = nombre mostrado del administrador (opcional)
- `ADMIN_EMAIL` = correo del administrador (opcional)

Conecta un Vercel Blob Store al proyecto para que los PDF subidos se guarden fuera del filesystem temporal de la Function.

## Rutas principales

- `/consulta` — consulta pública
- `/panel` — panel administrativo
- `/lunas` — registros administrativos
- `/api/login` — login
- `/api/importar/consulta/:tipo/:valor` — consulta pública
- `/api/importar/pdf` — importación PDF autenticada
- `/api/importar/lunas` — registros autenticados
- `/api/usuarios` — usuarios autenticados
- `/api/health` — comprobación de API + MongoDB

## Datos existentes

Esta versión no inventa ni reconstruye registros antiguos. La base de datos anterior era MariaDB y el respaldo entregado no contiene un dump SQL utilizable. Los registros existentes deben migrarse a MongoDB Atlas cuando se disponga de una exportación de la base de datos.
