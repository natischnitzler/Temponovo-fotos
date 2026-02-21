# Temponovo · Gestor de Imágenes Web

App colaborativa para gestionar imágenes de productos Odoo. Cualquier persona con la clave puede entrar, revisar productos sin imagen y subir fotos directo a Odoo.

## 🚀 Deploy en Render

### 1. Subir a GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/TU_USUARIO/temponovo-images-app.git
git push -u origin main
```

### 2. Crear servicio en Render
1. Ve a **render.com** → New → Web Service
2. Conecta tu repositorio de GitHub
3. Configura:
   - **Name:** temponovo-images-app
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`

### 3. Variables de entorno en Render
En Environment → Add Environment Variable:

| Key | Value |
|-----|-------|
| `ODOO_URL` | https://temponovo.odoo.com |
| `ODOO_DB` | cmcorpcl-temponovo-main-24490235 |
| `ODOO_USER` | natalia@temponovo.cl |
| `ODOO_PASS` | claveodoo94+ |
| `APP_PASS` | tali2025 |
| `SESSION_SECRET` | cualquier-string-largo-random |

### 4. Deploy
Render despliega automáticamente. En 2-3 minutos tienes la URL lista.

## 📱 Uso
1. Entra a la URL de Render
2. Ingresa la clave `tali2025`
3. Ve producto por producto, elige la mejor imagen
4. Clic en **Aprobar y subir a Odoo** → se sube instantáneamente
5. Pasa al siguiente automáticamente
