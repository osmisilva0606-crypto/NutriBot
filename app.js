require('dotenv').config();

const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const OpenAI = require('openai');
const { Telegraf } = require('telegraf');

const app = express();
const PORT = process.env.PORT || 3000;

const client = new MongoClient(process.env.MONGODB_URI);
const db = client.db('nutribot');

const usuarios = db.collection('usuarios');
const conversaciones = db.collection('conversaciones');
const recetas = db.collection('recetas');

const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1'
});

app.disable('x-powered-by');

app.use(express.json({ limit: '1mb' }));

// SESIONES DE USUARIO
app.use(session({
    name: 'nutribot.sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,

    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        dbName: 'nutribot',
        collectionName: 'sesiones',
        ttl: 7 * 24 * 60 * 60
    }),

    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000
    }
}));

// EVITAR QUE EL NAVEGADOR USE ARCHIVOS ANTIGUOS
app.use(express.static('public', {
    etag: false,
    lastModified: false,
    maxAge: 0,

    setHeaders(res) {
        res.setHeader(
            'Cache-Control',
            'no-store, no-cache, must-revalidate, proxy-revalidate'
        );
    }
}));

function regenerarSesion(req) {
    return new Promise((resolve, reject) => {
        req.session.regenerate(error => {
            if (error) reject(error);
            else resolve();
        });
    });
}

function guardarSesion(req) {
    return new Promise((resolve, reject) => {
        req.session.save(error => {
            if (error) reject(error);
            else resolve();
        });
    });
}

function datosPublicos(usuario) {
    return {
        id: usuario._id.toString(),
        nombre: usuario.nombre,
        correo: usuario.correo
    };
}

async function obtenerUsuarioDeSesion(req) {
    if (!req.session.userId || !ObjectId.isValid(req.session.userId)) {
        return null;
    }

    return usuarios.findOne({
        _id: new ObjectId(req.session.userId)
    });
}

// ==========================================
// REGISTRO
// ==========================================

app.post('/api/registro', async (req, res) => {
    try {
        const nombre = String(req.body?.nombre || '').trim();
        const correo = String(req.body?.correo || '').trim().toLowerCase();
        const contrasena = String(req.body?.contrasena || '');

        if (!nombre || !correo || !contrasena) {
            return res.status(400).json({
                error: 'Completa todos los campos.'
            });
        }

        if (nombre.length > 60) {
            return res.status(400).json({
                error: 'El nombre no debe superar los 60 caracteres.'
            });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
            return res.status(400).json({
                error: 'Escribe un correo válido.'
            });
        }

        if (contrasena.length < 8) {
            return res.status(400).json({
                error: 'La contraseña debe tener al menos 8 caracteres.'
            });
        }

        const existente = await usuarios.findOne({ correo });

        if (existente) {
            return res.status(409).json({
                error: 'Ya existe una cuenta con ese correo.'
            });
        }

        const passwordHash = await bcrypt.hash(contrasena, 12);

        const nuevoUsuario = {
            nombre,
            correo,
            passwordHash,
            preferencias: {},
            creadoEn: new Date()
        };

        const resultado = await usuarios.insertOne(nuevoUsuario);

        nuevoUsuario._id = resultado.insertedId;

        await regenerarSesion(req);

        req.session.userId = resultado.insertedId.toString();

        await guardarSesion(req);

        return res.status(201).json({
            mensaje: '¡Tu cuenta se creó correctamente!',
            usuario: datosPublicos(nuevoUsuario)
        });

    } catch (error) {
        console.error('Error en registro:', error);

        if (error.code === 11000) {
            return res.status(409).json({
                error: 'Ya existe una cuenta con ese correo.'
            });
        }

        return res.status(500).json({
            error: 'No se pudo crear la cuenta. Revisa la terminal del servidor.'
        });
    }
});

// ==========================================
// INICIO DE SESIÓN
// ==========================================

app.post('/api/login', async (req, res) => {
    try {
        const correo = String(req.body?.correo || '').trim().toLowerCase();
        const contrasena = String(req.body?.contrasena || '');

        if (!correo || !contrasena) {
            return res.status(400).json({
                error: 'Escribe tu correo y contraseña.'
            });
        }

        const usuario = await usuarios.findOne({ correo });

        if (!usuario || !usuario.passwordHash) {
            return res.status(401).json({
                error: 'Correo o contraseña incorrectos.'
            });
        }

        const correcta = await bcrypt.compare(
            contrasena,
            usuario.passwordHash
        );

        if (!correcta) {
            return res.status(401).json({
                error: 'Correo o contraseña incorrectos.'
            });
        }

        await regenerarSesion(req);

        req.session.userId = usuario._id.toString();

        await guardarSesion(req);

        return res.json({
            mensaje: '¡Bienvenido de nuevo!',
            usuario: datosPublicos(usuario)
        });

    } catch (error) {
        console.error('Error en inicio de sesión:', error);

        return res.status(500).json({
            error: 'No se pudo iniciar sesión.'
        });
    }
});

// ==========================================
// CONSULTAR SESIÓN
// ==========================================

app.get('/api/sesion', async (req, res) => {
    try {
        const usuario = await obtenerUsuarioDeSesion(req);

        if (!usuario) {
            return res.json({
                autenticado: false,
                usuario: null
            });
        }

        return res.json({
            autenticado: true,
            usuario: datosPublicos(usuario)
        });

    } catch (error) {
        console.error('Error al consultar sesión:', error);

        return res.status(500).json({
            error: 'No se pudo consultar la sesión.'
        });
    }
});

// ==========================================
// CERRAR SESIÓN
// ==========================================

app.post('/api/logout', (req, res) => {
    req.session.destroy(error => {
        if (error) {
            console.error('Error al cerrar sesión:', error);

            return res.status(500).json({
                error: 'No se pudo cerrar la sesión.'
            });
        }

        res.clearCookie('nutribot.sid');

        return res.json({
            mensaje: 'Sesión cerrada correctamente.'
        });
    });
});

// ==========================================
// BUSCAR RECETAS EXISTENTES
// ==========================================

async function buscarRecetas(pregunta) {
    const todas = await recetas.find(
        {},
        { projection: { ingredientes: 1 } }
    ).toArray();

    const mencionados = [...new Set(
        todas.flatMap(receta =>
            Array.isArray(receta.ingredientes)
                ? receta.ingredientes
                : []
        )
        .map(ingrediente =>
            typeof ingrediente === 'string'
                ? ingrediente
                : ingrediente?.nombre
        )
        .filter(nombre =>
            nombre &&
            pregunta.toLowerCase().includes(String(nombre).toLowerCase())
        )
    )];

    if (!mencionados.length) {
        return [];
    }

    return recetas.find({
        $or: [
            {
                'ingredientes.nombre': {
                    $in: mencionados
                }
            },
            {
                ingredientes: {
                    $in: mencionados
                }
            }
        ]
    }).limit(10).toArray();
}

// ==========================================
// GENERAR RESPUESTA DE NUTRIBOT
// ==========================================

async function generarRespuesta(pregunta, conversacionId, usuario = null) {

    if (typeof pregunta !== 'string' || !pregunta.trim()) {
        throw new Error('Debes escribir una pregunta.');
    }

    const conversacion = await conversaciones.findOne({
        conversacionId
    });

    const historial = (conversacion?.mensajes || [])
        .slice(-20)
        .filter(mensaje =>
            ['user', 'assistant'].includes(mensaje.role) &&
            typeof mensaje.content === 'string'
        )
        .map(mensaje => ({
            role: mensaje.role,
            content: mensaje.content
        }));

    const recetasEncontradas = await buscarRecetas(pregunta);

    const contextoNombre = usuario
        ? `\nEl nombre de la persona es ${usuario.nombre}. Puedes utilizarlo naturalmente y sin repetirlo demasiado.\n`
        : '';

    const respuesta = await groq.chat.completions.create({
        model: 'openai/gpt-oss-20b',

        messages: [
            {
                role: 'system',

                content: `Eres NutriBot, un asistente inteligente especializado en recetas, cocina y alimentación.

Tu personalidad es cálida, amigable, espontánea y entusiasta por la cocina.

${contextoNombre}

REGLAS:

1. Responde siempre en español.
2. Utiliza lenguaje sencillo y natural.
3. No menciones bases de datos ni sistemas internos.
4. Puedes utilizar las recetas proporcionadas como referencia, pero también puedes crear recetas nuevas.
5. Mantén el contexto de la conversación.
6. Recuerda los ingredientes disponibles, gustos y preferencias de la persona.
7. Si rechazan una receta, comprende qué no les gustó y adapta tus siguientes recomendaciones.
8. Haz preguntas espontáneas cuando ayuden, pero no hagas demasiadas.
9. Si saludan o hacen una pregunta general, responde normalmente.
10. Cuando soliciten una receta, proporciona ingredientes, cantidades y preparación paso a paso.
11. No repitas recomendaciones que ya rechazaron.
12. Adapta las recomendaciones al presupuesto, tiempo e ingredientes disponibles.
13. Utiliza emojis moderadamente.
14. Evita respuestas mecánicas.

SEGURIDAD:

- Presta atención a alergias e intolerancias.
- Si mencionan una condición médica, ofrece información general.
- No sustituyas la orientación de un profesional de salud.
- No inventes información nutricional ni diagnostiques enfermedades.
- Si no tienes datos nutricionales verificados, acláralo.

Tu prioridad es entender a la persona y ayudarla a encontrar comidas que disfrute.`
            },

            ...historial,

            {
                role: 'user',

                content: `Pregunta: ${pregunta}

Recetas que podrían ser útiles:
${JSON.stringify(recetasEncontradas)}`
            }
        ],

        temperature: 0.7,
        max_tokens: 700
    });

    const textoRespuesta =
        respuesta.choices?.[0]?.message?.content?.trim();

    if (!textoRespuesta) {
        throw new Error('El servicio de IA devolvió una respuesta vacía.');
    }

    await conversaciones.updateOne(
        { conversacionId },

        {
            $push: {
                mensajes: {
                    $each: [
                        {
                            role: 'user',
                            content: pregunta,
                            fecha: new Date()
                        },
                        {
                            role: 'assistant',
                            content: textoRespuesta,
                            fecha: new Date()
                        }
                    ],
                    $slice: -100
                }
            },

            $set: {
                actualizadoEn: new Date()
            },

            $setOnInsert: {
                creadoEn: new Date()
            }
        },

        { upsert: true }
    );

    return textoRespuesta;
}

// ==========================================
// CHAT DE LA PÁGINA WEB
// ==========================================

app.post('/preguntar', async (req, res) => {
    try {
        const pregunta = String(req.body?.pregunta || '').trim();

        if (!pregunta) {
            return res.status(400).json({
                error: 'Escribe una pregunta.'
            });
        }

        const usuario = await obtenerUsuarioDeSesion(req);

        // El servidor identifica la conversación.
        // El navegador NO necesita enviar conversacionId.
        const conversacionId = usuario
            ? `web:usuario:${usuario._id.toString()}`
            : `web:invitado:${req.sessionID}`;

        const respuesta = await generarRespuesta(
            pregunta,
            conversacionId,
            usuario
        );

        return res.json({ respuesta });

    } catch (error) {
        console.error('Error en /preguntar:', error);

        return res.status(500).json({
            error: 'No se pudo generar una respuesta. Revisa la terminal del servidor.'
        });
    }
});

// ==========================================
// RUTAS AUXILIARES
// ==========================================

app.post('/mensaje', (req, res) => {
    const mensaje = req.body?.mensaje;

    console.log('Mensaje recibido:', mensaje);

    res.json({
        respuesta: '¡Hola! Soy NutriBot. ¿En qué puedo ayudarte?'
    });
});

app.post('/prueba-db', async (req, res) => {
    try {
        const resultado = await db.collection('pruebas').insertOne({
            mensaje: '¡NutriBot ya puede guardar información!',
            fecha: new Date()
        });

        res.json({
            mensaje: 'Documento guardado correctamente',
            id: resultado.insertedId
        });

    } catch (error) {
        console.error('Error en /prueba-db:', error);

        res.status(500).json({
            error: 'No se pudo guardar el documento.'
        });
    }
});

app.post('/agregar-receta', async (req, res) => {
    try {
        const resultado = await recetas.insertOne(req.body);

        res.json({
            mensaje: '¡Receta guardada correctamente!',
            id: resultado.insertedId
        });

    } catch (error) {
        console.error('Error en /agregar-receta:', error);

        res.status(500).json({
            error: 'No se pudo guardar la receta.'
        });
    }
});

app.get('/recetas', async (req, res) => {
    try {
        const resultado = await recetas.find().toArray();

        res.json(resultado);

    } catch (error) {
        console.error('Error en /recetas:', error);

        res.status(500).json({
            error: 'No se pudieron consultar las recetas.'
        });
    }
});

// ==========================================
// TELEGRAM
// ==========================================

let bot = null;

if (process.env.TELEGRAM_BOT_TOKEN) {

    bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

    bot.start(ctx => {
        return ctx.reply(
            '¡Hola! 🍓 Soy NutriBot, tu asistente de recetas y alimentación.\n\nCuéntame qué tienes en mente y encontremos algo delicioso para preparar.'
        );
    });

    bot.command('reset', async ctx => {
        const conversacionId = `telegram:${ctx.from.id}`;

        await conversaciones.deleteOne({
            conversacionId
        });

        await ctx.reply(
            '¡Listo! Comencemos una nueva conversación. 🍓'
        );
    });

    bot.on('text', async ctx => {
        try {
            const pregunta = ctx.message.text;

            if (pregunta.startsWith('/')) {
                return;
            }

            const conversacionId = `telegram:${ctx.from.id}`;

            await ctx.sendChatAction('typing');

            const respuesta = await generarRespuesta(
                pregunta,
                conversacionId
            );

            for (let i = 0; i < respuesta.length; i += 4000) {
                await ctx.reply(
                    respuesta.substring(i, i + 4000)
                );
            }

        } catch (error) {
            console.error('Error al responder en Telegram:', error);

            await ctx.reply(
                'Lo siento, tuve un problema al responderte. Intenta nuevamente en unos segundos. 💗'
            );
        }
    });

    bot.catch(error => {
        console.error('Error interno de Telegram:', error);
    });

} else {
    console.error('No se encontró TELEGRAM_BOT_TOKEN en el archivo .env');
}

// ==========================================
// INICIAR SERVIDOR
// ==========================================

let servidor;

async function iniciarNutriBot() {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('Falta MONGODB_URI en .env');
        }

        if (!process.env.GROQ_API_KEY) {
            throw new Error('Falta GROQ_API_KEY en .env');
        }

        if (!process.env.SESSION_SECRET) {
            throw new Error('Falta SESSION_SECRET en .env');
        }

        console.log('Iniciando NutriBot...');

        console.log(
            'Token de Telegram detectado:',
            Boolean(process.env.TELEGRAM_BOT_TOKEN)
        );

        await client.connect();

        await usuarios.createIndex(
            { correo: 1 },
            { unique: true }
        );

        console.log('¡Conectado correctamente a MongoDB Atlas!');
        console.log('Índice de correos verificado.');

        servidor = app.listen(PORT, () => {
            console.log(`NutriBot está funcionando en el puerto ${PORT}`);
        });

        if (bot) {
            console.log('Intentando conectar con Telegram...');

            await bot.launch();

            console.log('¡NutriBot también está conectado a Telegram!');
        }

    } catch (error) {
        console.error('Error al iniciar NutriBot:', error);

        if (servidor) {
            servidor.close();
        }

        await client.close().catch(() => {});

        process.exitCode = 1;
    }
}


// CIERRE CORRECTO
async function cerrarTodo(signal) {
    console.log(`Cerrando NutriBot (${signal})...`);

    if (bot) {
        try {
            await bot.stop(signal);
        } catch (error) {
            console.log('El bot de Telegram ya estaba detenido.');
        }
    }

    if (servidor) {
        await new Promise(resolve => servidor.close(resolve));
    }

    await client.close().catch(console.error);

    process.exit(0);
}

process.once('SIGINT', () => cerrarTodo('SIGINT'));
process.once('SIGTERM', () => cerrarTodo('SIGTERM'));

iniciarNutriBot();
