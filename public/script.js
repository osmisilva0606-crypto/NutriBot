
// ==========================================
// ELEMENTOS DE LA PÁGINA
// ==========================================

const input = document.getElementById('messageInput');
const botonEnviar = document.getElementById('sendButton');
const contenedorMensajes = document.getElementById('messages');
let bienvenida = document.getElementById('welcome');

// Guardamos una copia de la bienvenida para poder restaurarla.
const bienvenidaOriginal = bienvenida
    ? bienvenida.cloneNode(true)
    : null;

const accountButton = document.getElementById('accountButton');
const accountButtonText = document.getElementById('accountButtonText');
const accountIcon = document.getElementById('accountIcon');
const accountMenu = document.getElementById('accountMenu');
const accountMenuNote = document.getElementById('accountMenuNote');

const registerOption = document.getElementById('registerOption');
const loginOption = document.getElementById('loginOption');
const logoutOption = document.getElementById('logoutOption');

const accountModal = document.getElementById('accountModal');
const closeModal = document.getElementById('closeModal');
const accountForm = document.getElementById('accountForm');

const modalTitle = document.getElementById('modalTitle');
const modalDescription = document.getElementById('modalDescription');
const modalSubmit = document.getElementById('modalSubmit');
const modalSwitch = document.getElementById('modalSwitch');

const nameGroup = document.getElementById('nameGroup');
const nameInput = document.getElementById('nameInput');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const formMessage = document.getElementById('formMessage');

let usuarioActual = null;
let modoFormulario = 'registro';
let enviandoMensaje = false;


// ==========================================
// ACTUALIZAR INFORMACIÓN DE LA CUENTA
// ==========================================

function actualizarCuenta(usuario) {
    usuarioActual = usuario || null;

    if (usuarioActual) {
        accountButtonText.textContent = usuarioActual.nombre;

        accountIcon.textContent =
            usuarioActual.nombre.charAt(0).toUpperCase();

        accountMenuNote.textContent =
            `Sesión iniciada como ${usuarioActual.correo}`;

        registerOption.hidden = true;
        loginOption.hidden = true;
        logoutOption.hidden = false;

    } else {
        accountButtonText.textContent = 'Mi cuenta';
        accountIcon.textContent = '♙';

        accountMenuNote.textContent =
            'Puedes conversar sin registrarte.';

        registerOption.hidden = false;
        loginOption.hidden = false;
        logoutOption.hidden = true;
    }
}


// ==========================================
// CONSULTAR SI EXISTE UNA SESIÓN
// ==========================================

async function consultarSesion() {
    try {
        const respuesta = await fetch('/api/sesion', {
            credentials: 'same-origin',
            cache: 'no-store'
        });

        const datos = await respuesta.json();

        actualizarCuenta(
            datos.autenticado ? datos.usuario : null
        );

    } catch (error) {
        console.error('No se pudo consultar la sesión:', error);

        actualizarCuenta(null);
    }
}


// ==========================================
// LIMPIAR CONVERSACIÓN DE LA PANTALLA
// ==========================================

function limpiarChat() {
    // Quitamos el indicador de escritura.
    quitarEscribiendo();

    // Eliminamos los mensajes visibles.
    contenedorMensajes
        .querySelectorAll('.message-row')
        .forEach(mensaje => mensaje.remove());

    // Restauramos la bienvenida.
    if (bienvenidaOriginal) {
        const bienvenidaActual =
            document.getElementById('welcome');

        if (!bienvenidaActual) {
            bienvenida = bienvenidaOriginal.cloneNode(true);

            contenedorMensajes.prepend(bienvenida);
        } else {
            bienvenida = bienvenidaActual;
        }
    }

    contenedorMensajes.scrollTop = 0;
}


// ==========================================
// MENSAJES DEL FORMULARIO
// ==========================================

function mostrarMensajeFormulario(texto, tipo = '') {
    formMessage.textContent = texto;

    formMessage.className = 'form-message';

    if (tipo) {
        formMessage.classList.add(tipo);
    }
}


// ==========================================
// CAMBIAR ENTRE REGISTRO E INICIO DE SESIÓN
// ==========================================

function construirCambioModal(texto, modo) {
    modalSwitch.replaceChildren(
        document.createTextNode(texto + ' ')
    );

    const boton = document.createElement('button');

    boton.type = 'button';

    boton.textContent =
        modo === 'login'
            ? 'Inicia sesión'
            : 'Regístrate';

    boton.addEventListener('click', () => {
        abrirModal(modo);
    });

    modalSwitch.appendChild(boton);
}


// ==========================================
// ABRIR MODAL
// ==========================================

function abrirModal(modo) {
    modoFormulario = modo;

    accountMenu.classList.add('hidden');

    accountModal.classList.remove('hidden');

    accountForm.reset();

    mostrarMensajeFormulario('');

    const registro = modo === 'registro';

    modalTitle.textContent = registro
        ? 'Crear tu cuenta'
        : '¡Qué gusto verte de nuevo!';

    modalDescription.textContent = registro
        ? 'Guarda tus conversaciones y permite que NutriBot conozca tus preferencias.'
        : 'Inicia sesión para continuar con tu cuenta y tus conversaciones.';

    nameGroup.style.display = registro ? 'block' : 'none';

    nameInput.required = registro;

    passwordInput.autocomplete = registro
        ? 'new-password'
        : 'current-password';

    modalSubmit.textContent = registro
        ? 'Crear cuenta'
        : 'Iniciar sesión';

    construirCambioModal(
        registro
            ? '¿Ya tienes una cuenta?'
            : '¿Aún no tienes una cuenta?',

        registro ? 'login' : 'registro'
    );

    if (registro) {
        nameInput.focus();
    } else {
        emailInput.focus();
    }
}


// ==========================================
// CERRAR MODAL
// ==========================================

function cerrarModal() {
    accountModal.classList.add('hidden');

    accountForm.reset();

    mostrarMensajeFormulario('');
}


// ==========================================
// EVENTOS DEL MENÚ
// ==========================================

accountButton.addEventListener('click', () => {
    accountMenu.classList.toggle('hidden');
});

document.addEventListener('click', event => {
    if (
        !accountButton.contains(event.target) &&
        !accountMenu.contains(event.target)
    ) {
        accountMenu.classList.add('hidden');
    }
});

registerOption.addEventListener('click', () => {
    abrirModal('registro');
});

loginOption.addEventListener('click', () => {
    abrirModal('login');
});

closeModal.addEventListener('click', cerrarModal);

accountModal.addEventListener('click', event => {
    if (event.target === accountModal) {
        cerrarModal();
    }
});

document.addEventListener('keydown', event => {
    if (
        event.key === 'Escape' &&
        !accountModal.classList.contains('hidden')
    ) {
        cerrarModal();
    }
});


// ==========================================
// REGISTRO E INICIO DE SESIÓN
// ==========================================

accountForm.addEventListener('submit', async event => {
    event.preventDefault();

    const nombre = nameInput.value.trim();
    const correo = emailInput.value.trim();
    const contrasena = passwordInput.value;

    const esRegistro = modoFormulario === 'registro';

    if (esRegistro && !nombre) {
        mostrarMensajeFormulario(
            'Escribe tu nombre.',
            'error'
        );

        return;
    }

    if (contrasena.length < 8) {
        mostrarMensajeFormulario(
            'La contraseña debe tener al menos 8 caracteres.',
            'error'
        );

        return;
    }

    modalSubmit.disabled = true;

    modalSubmit.textContent = esRegistro
        ? 'Creando cuenta...'
        : 'Iniciando sesión...';

    mostrarMensajeFormulario('');

    try {
        const respuesta = await fetch(
            esRegistro ? '/api/registro' : '/api/login',
            {
                method: 'POST',

                credentials: 'same-origin',
                cache: 'no-store',

                headers: {
                    'Content-Type': 'application/json'
                },

                body: JSON.stringify(
                    esRegistro
                        ? { nombre, correo, contrasena }
                        : { correo, contrasena }
                )
            }
        );

        const resultado = await respuesta.json().catch(() => ({}));

        if (!respuesta.ok) {
            mostrarMensajeFormulario(
                resultado.error ||
                `Error del servidor (${respuesta.status}).`,
                'error'
            );

            return;
        }

        actualizarCuenta(resultado.usuario);

        cerrarModal();

        limpiarChat();

        agregarMensaje(
            esRegistro
                ? '¡Tu cuenta se creó correctamente! 💗 Ya puedes conversar conmigo y guardar tu historial.'
                : `¡Hola de nuevo, ${resultado.usuario.nombre}! 💗 Qué gusto tenerte por aquí.`,
            'bot'
        );

    } catch (error) {
        console.error('Error de cuenta:', error);

        mostrarMensajeFormulario(
            'No se pudo conectar con el servidor. Revisa que NutriBot siga funcionando.',
            'error'
        );

    } finally {
        modalSubmit.disabled = false;

        modalSubmit.textContent = esRegistro
            ? 'Crear cuenta'
            : 'Iniciar sesión';
    }
});


// ==========================================
// CERRAR SESIÓN
// ==========================================

logoutOption.addEventListener('click', async () => {
    accountMenu.classList.add('hidden');

    try {
        const respuesta = await fetch('/api/logout', {
            method: 'POST',
            credentials: 'same-origin',
            cache: 'no-store'
        });

        const resultado = await respuesta.json().catch(() => ({}));

        if (!respuesta.ok) {
            alert(resultado.error || 'No se pudo cerrar la sesión.');
            return;
        }

        // Cerramos la cuenta en la interfaz.
        actualizarCuenta(null);

        // Eliminamos los mensajes de la conversación anterior.
        limpiarChat();

        // Dejamos el chat listo para un nuevo invitado.
        input.value = '';
        input.focus();

    } catch (error) {
        console.error('Error al cerrar sesión:', error);

        alert('No se pudo conectar con el servidor.');
    }
});


// ==========================================
// MOSTRAR MENSAJES EN EL CHAT
// ==========================================

function agregarMensaje(texto, tipo) {
    if (bienvenida && bienvenida.isConnected) {
        bienvenida.remove();
    }

    const fila = document.createElement('div');

    fila.className =
        `message-row ${tipo === 'user' ? 'user' : 'bot'}`;

    const avatar = document.createElement('div');

    avatar.className = 'avatar';

    if (tipo === 'user') {
        avatar.textContent = usuarioActual
            ? usuarioActual.nombre.charAt(0).toUpperCase()
            : 'T';

    } else {
        const imagen = document.createElement('img');

        imagen.src = 'logo-nutribot.png';

        imagen.alt = 'NutriBot';

        imagen.onerror = () => {
            avatar.textContent = '💗';
        };

        avatar.appendChild(imagen);
    }

    const contenido = document.createElement('div');

    contenido.className = 'message-content';

    const nombre = document.createElement('div');

    nombre.className = 'message-name';

    nombre.textContent = tipo === 'user'
        ? (usuarioActual ? usuarioActual.nombre : 'Tú')
        : 'NutriBot';

    const burbuja = document.createElement('div');

    burbuja.className = 'bubble';

    burbuja.textContent = texto;

    contenido.append(nombre, burbuja);

    fila.append(avatar, contenido);

    contenedorMensajes.appendChild(fila);

    contenedorMensajes.scrollTop =
        contenedorMensajes.scrollHeight;
}


// ==========================================
// INDICADOR DE ESCRITURA
// ==========================================

function mostrarEscribiendo() {
    quitarEscribiendo();

    const indicador = document.createElement('div');

    indicador.className = 'typing';

    indicador.id = 'typingIndicator';

    indicador.textContent = 'NutriBot está pensando...';

    contenedorMensajes.appendChild(indicador);

    contenedorMensajes.scrollTop =
        contenedorMensajes.scrollHeight;
}

function quitarEscribiendo() {
    document.getElementById('typingIndicator')?.remove();
}


// ==========================================
// ENVIAR MENSAJE A NUTRIBOT
// ==========================================

async function enviarMensaje() {
    const pregunta = input.value.trim();

    if (!pregunta || enviandoMensaje) {
        return;
    }

    enviandoMensaje = true;

    input.value = '';

    botonEnviar.disabled = true;

    agregarMensaje(pregunta, 'user');

    mostrarEscribiendo();

    try {
        const respuesta = await fetch('/preguntar', {
            method: 'POST',

            credentials: 'same-origin',
            cache: 'no-store',

            headers: {
                'Content-Type': 'application/json'
            },

            body: JSON.stringify({
                pregunta
            })
        });

        const datos = await respuesta.json().catch(() => ({}));

        quitarEscribiendo();

        if (!respuesta.ok) {
            agregarMensaje(
                datos.error ||
                `No pude responder (error ${respuesta.status}).`,
                'bot'
            );

            return;
        }

        agregarMensaje(
            datos.respuesta ||
            'No recibí una respuesta. Intenta otra vez.',
            'bot'
        );

    } catch (error) {
        console.error('Error al enviar mensaje:', error);

        quitarEscribiendo();

        agregarMensaje(
            'No pude conectarme con el servidor. Revisa que NutriBot esté funcionando.',
            'bot'
        );

    } finally {
        enviandoMensaje = false;

        botonEnviar.disabled = false;

        input.focus();
    }
}


// ==========================================
// EVENTOS DEL CHAT
// ==========================================

botonEnviar.addEventListener('click', enviarMensaje);

input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
        enviarMensaje();
    }
});


// ==========================================
// INICIALIZAR
// ==========================================

consultarSesion();

input.focus();
