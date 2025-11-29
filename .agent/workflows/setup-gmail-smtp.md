---
description: Guía para implementar envío de correos usando Gmail SMTP (Alternativa rápida a Resend/SendGrid)
---

# Implementación de Gmail SMTP con Nodemailer

Esta guía detalla cómo configurar un sistema de envío de correos utilizando una cuenta de Gmail y Nodemailer. Es ideal para MVPs, pruebas o herramientas internas donde se quiere evitar la configuración compleja de DNS (DKIM/SPF) y dependencias de TI.

## 1. Configuración de la Cuenta de Google

Para permitir que una aplicación envíe correos por ti:

1.  Accede a tu cuenta de Gmail.
2.  Ve a **Gestionar tu cuenta de Google** -> **Seguridad**.
3.  Activa la **Verificación en 2 pasos** (si no está activa).
4.  Busca la opción **"Contraseñas de aplicaciones"** (App Passwords).
    *   *Nota:* Si no la encuentras, usa el buscador de la configuración.
5.  Crea una nueva contraseña:
    *   **App:** Otra (nombre personalizado).
    *   **Nombre:** Ej. "Mi App Web".
6.  **Copia el código de 16 caracteres** generado. Esta será tu `SMTP_PASSWORD`.

## 2. Instalación de Dependencias

En tu proyecto (Node.js/Next.js):

```bash
npm install nodemailer
npm install -D @types/nodemailer
```

## 3. Variables de Entorno

Configura tu archivo `.env` o `.env.local`:

```env
SMTP_EMAIL=tu_correo@gmail.com
SMTP_PASSWORD=tu_codigo_de_16_letras
```

## 4. Implementación del Servicio (Ejemplo TypeScript)

Crea un archivo `lib/email.ts` o similar:

```typescript
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD,
  },
});

export const sendEmail = async (to: string, subject: string, html: string) => {
  try {
    const info = await transporter.sendMail({
      from: `"Nombre de tu App" <${process.env.SMTP_EMAIL}>`,
      to,
      subject,
      html,
    });
    console.log('Email sent:', info.messageId);
    return { success: true, id: info.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error };
  }
};
```

## 5. Consideraciones

*   **Remitente:** Los correos siempre saldrán como "De: tu_correo@gmail.com" (o el nombre que configures, pero la dirección base será la de Gmail).
*   **Límites:** Gmail tiene límites de envío diarios (aprox. 500-2000 correos). No usar para marketing masivo.
*   **Producción:** En Vercel/Netlify, recuerda agregar `SMTP_EMAIL` y `SMTP_PASSWORD` en las variables de entorno del panel de control.
