let registroActual = null;

function abrirModal(registro){

    registroActual = registro;

    document.getElementById("ePlaca").value = registro.placa || "";
    document.getElementById("ePropietario").value = registro.propietario || "";
    document.getElementById("eCertificado").value = registro.nro_certificado || "";
    document.getElementById("eCategoria").value = registro.categoria || "";
    document.getElementById("eMarca").value = registro.marca || "";
    document.getElementById("eModelo").value = registro.modelo || "";
    document.getElementById("eColor").value = registro.color || "";
    document.getElementById("eMotor").value = registro.motor || "";
    document.getElementById("eSerie").value = registro.serie || "";
    document.getElementById("eAnio").value = registro.anio || "";

    document.getElementById("modalEditar").style.display = "flex";

}

function cerrarModal(){

    document.getElementById("modalEditar").style.display = "none";

}