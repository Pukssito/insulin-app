# Insulin Diario 💉

Aplicación móvil híbrida diseñada para la gestión rápida y eficiente de inyecciones de insulina y control de niveles de glucosa. Optimizada para el cuidado de pacientes diabéticos con una interfaz moderna, humana y centrada en la facilidad de uso.

## 🚀 Características Principales

- **Diario de Insulina:** Registro de dosis basal y bolus en franjas horarias inteligentes (Mañana, Tarde, Noche).
- **Control de Glucosa:** Seguimiento manual de niveles de azúcar (mg/dL) integrado en cada registro de insulina.
- **Historial con Calendario Interactivo:** Vista retrospectiva de los últimos días con resaltado de fechas y resúmenes diarios (media de azúcar y total de unidades).
- **Configuración Personalizada:** Selector visual de marcas de insulina (Plumas/Viales) categorizado por tipo (Basal, Prandial, Mixta).
- **Alertas de Olvido:** Sistema inteligente que detecta si una dosis basal no ha sido aplicada al finalizar su franja horaria.
- **Privacidad Local:** Los datos se almacenan exclusivamente en el dispositivo mediante Capacitor Preferences.

## 🛠️ Stack Tecnológico

- **Framework:** [Ionic 7](https://ionicframework.com/) con [Angular 17](https://angular.io/) (Standalone Components).
- **Lenguaje:** TypeScript.
- **Persistencia:** @capacitor/preferences.
- **Notificaciones:** @capacitor/local-notifications.
- **Estilos:** SCSS con arquitectura de diseño moderna (Glassmorphism & Dark Mode).

## 📦 Instalación y Desarrollo

1.  **Clonar el repositorio.**
2.  **Instalar dependencias:**
    ```bash
    npm install
    ```
3.  **Ejecutar en navegador:**
    ```bash
    npm start
    ```
    *(La aplicación se levantará normalmente en el puerto 8100 o similar).*

4.  **Generar versión Android:**
    ```bash
    npx cap sync android
    ```

## 📖 Uso

-   **Home:** Visualiza el estado del día actual. Pulsa en la cabecera de la fecha para acceder al historial.
-   **Configuración:** Selecciona las insulinas que utilizas para que la app genere automáticamente tus horarios de inyección.
-   **Historial:** Usa el calendario para seleccionar un día pasado y revisar los detalles de glucosa e insulina de esa jornada.

---
_Desarrollado como asistente de salud familiar 🤖_
