const API = "http://localhost:3000/login";

const btn = document.getElementById("btnLogin");
const mensaje = document.getElementById("mensaje");

btn.addEventListener("click", async () => {

    const usuario = document.getElementById("usuario").value.trim();
    const password = document.getElementById("password").value.trim();

    if (!usuario || !password) {

        mensaje.style.color = "red";
        mensaje.innerHTML = "Complete todos los campos";
        return;

    }

    try {

        const respuesta = await fetch(API, {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                usuario,
                password
            })

        });

        const datos = await respuesta.json();

        if (datos.ok) {

            // Guardar JWT
            sessionStorage.setItem("token", datos.token);

            // Datos del usuario
            sessionStorage.setItem("admin", "ok");
            sessionStorage.setItem("usuario", datos.usuario.usuario);
            sessionStorage.setItem("nombre", datos.usuario.nombre);

            mensaje.style.color = "green";
            mensaje.innerHTML = "Bienvenido " + datos.usuario.nombre;

            setTimeout(() => {

                window.location.href = "/panel";

            }, 800);

        } else {

            mensaje.style.color = "red";
            mensaje.innerHTML = datos.mensaje;

        }

    } catch (error) {

        console.error(error);

        mensaje.style.color = "red";
        mensaje.innerHTML = "No se pudo conectar con el servidor";

    }

});