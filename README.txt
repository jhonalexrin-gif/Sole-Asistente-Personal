SOLE + GROQ — SERVIDOR PARA RENDER

Este servicio guarda la clave de Groq en Render y recibe consultas desde la app Sole. No guarda conversaciones.

Variables de entorno requeridas:
- GROQ_API_KEY: clave creada en Groq Console.
- SOLE_CLIENT_TOKEN: código privado de conexión que debe coincidir con el configurado dentro de Sole.
- GROQ_MODEL: opcional; por defecto llama-3.3-70b-versatile.

Para desplegar: sube esta carpeta como repositorio a GitHub y en Render crea un Web Service desde ese repositorio. Build: npm install. Start: npm start. Health check: /health. En Environment agrega las dos claves secretas y despliega. Render entrega una URL HTTPS terminada en onrender.com.

No publiques GROQ_API_KEY ni la incluyas en la aplicación Android.

