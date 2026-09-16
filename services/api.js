const API = "/api/login";

const btn = document.getElementById("btnLogin");
const mensaje = document.getElementById("mensaje");

btn.addEventListener("click", async () => {

    const usuario = document.getElementById("usuario").value.trim();
    const password = document.getElementById("password").value.trim();

    if (usuario === "" || password === "") {

        mensaje.style.color = "red";
        mensaje.innerHTML = "Complete todos los campos";

        return;
    }

    // Desactivar botón mientras inicia sesión
    btn.disabled = true;
    btn.innerHTML = "INGRESANDO...";

    try {

        const respuesta = await fetch(API, {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                usuario: usuario,
                password: password
            }),

            cache: "no-store"

        });

        let datos;

        try {

            datos = await respuesta.json();

        } catch (error) {

            console.error("Respuesta inválida del servidor:", error);

            mensaje.style.color = "red";
            mensaje.innerHTML = "Respuesta inválida del servidor";

            btn.disabled = false;
            btn.innerHTML = "INGRESAR";

            return;
        }


        // ==========================================
        // LOGIN CORRECTO
        // ==========================================

        if (respuesta.ok && datos.ok && datos.token) {

            // Limpiar tokens anteriores
            localStorage.removeItem("token");
            sessionStorage.removeItem("token");

            // Guardar el nuevo JWT
            localStorage.setItem("token", datos.token);
            sessionStorage.setItem("token", datos.token);


            // Guardar información del usuario
            if (datos.usuario) {

                if (datos.usuario.usuario) {

                    sessionStorage.setItem(
                        "usuario",
                        datos.usuario.usuario
                    );

                }

                if (datos.usuario.nombre) {

                    sessionStorage.setItem(
                        "nombre",
                        datos.usuario.nombre
                    );

                }

            }


            // Marcar sesión administrativa
            sessionStorage.setItem("admin", "ok");


            mensaje.style.color = "green";

            mensaje.innerHTML =
                "Bienvenido " +
                (
                    datos.usuario && datos.usuario.nombre
                    ? datos.usuario.nombre
                    : usuario
                );


            // Esperar un momento y entrar al panel
            setTimeout(() => {

                window.location.replace("/panel");

            }, 500);


            return;
        }


        // ==========================================
        // LOGIN INCORRECTO
        // ==========================================

        mensaje.style.color = "red";

        mensaje.innerHTML =
            datos.mensaje ||
            "Usuario o contraseña incorrectos";


        btn.disabled = false;
        btn.innerHTML = "INGRESAR";


    } catch (error) {

        console.error("ERROR LOGIN:", error);

        mensaje.style.color = "red";

        mensaje.innerHTML =
            "No se pudo conectar con el servidor";


        btn.disabled = false;
        btn.innerHTML = "INGRESAR";

    }

});
