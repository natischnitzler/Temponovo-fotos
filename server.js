const express = require("express");
const session = require("express-session");
const xmlrpc = require("xmlrpc");
const https = require("https");
const http = require("http");
const url = require("url");

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));
app.use(session({
  secret: process.env.SESSION_SECRET || "temponovo-secret-2025",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 horas
}));

// ── Config desde variables de entorno ─────────────────────
const CONFIG = {
  ODOO_URL:  process.env.ODOO_URL  || "https://temponovo.odoo.com",
  ODOO_DB:   process.env.ODOO_DB   || "cmcorpcl-temponovo-main-24490235",
  ODOO_USER: process.env.ODOO_USER || "natalia@temponovo.cl",
  ODOO_PASS: process.env.ODOO_PASS || "claveodoo94+",
  APP_PASS:  process.env.APP_PASS  || "tali2025",
};

// ── Helpers Odoo XML-RPC ───────────────────────────────────
function odooCall(path, method, params) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(CONFIG.ODOO_URL);
    const client = xmlrpc.createSecureClient({
      host: parsedUrl.hostname,
      port: 443,
      path: path,
    });
    client.methodCall(method, params, (err, val) => {
      if (err) reject(err);
      else resolve(val);
    });
  });
}

async function odooAuth() {
  const uid = await odooCall("/xmlrpc/2/common", "authenticate", [
    CONFIG.ODOO_DB, CONFIG.ODOO_USER, CONFIG.ODOO_PASS, {}
  ]);
  if (!uid) throw new Error("No se pudo autenticar en Odoo");
  return uid;
}

async function odooExecute(uid, model, method, args, kwargs = {}) {
  return odooCall("/xmlrpc/2/object", "execute_kw", [
    CONFIG.ODOO_DB, uid, CONFIG.ODOO_PASS, model, method, args, kwargs
  ]);
}

// ── Middleware de autenticación ────────────────────────────
function requireAuth(req, res, next) {
  if (req.session.authenticated) return next();
  res.status(401).json({ error: "No autenticado" });
}

// ── Búsqueda de imágenes (scraping Google) ─────────────────
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
];

function buscarImagenes(query) {
  return new Promise((resolve) => {
    const q = encodeURIComponent(query);
    const options = {
      hostname: "www.google.com",
      path: `/search?q=${q}&tbm=isch&num=10`,
      headers: {
        "User-Agent": USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
        "Accept-Language": "es-419,es;q=0.9",
        "Referer": "https://www.google.com/",
      }
    };
    https.get(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        let urls = [];
        const matches = data.match(/"ou":"(https?:\/\/[^"]+?)"/g);
        if (matches) {
          urls = matches.map(m => m.replace(/"ou":"/, "").replace(/"$/, "")).slice(0, 5);
        }
        if (urls.length === 0) {
          const fallback = data.match(/https?:\/\/(?!(?:www\.)?(?:google|gstatic))[^\s"<>]+?\.(?:jpg|jpeg|png|webp)/g);
          if (fallback) urls = [...new Set(fallback)].slice(0, 5);
        }
        resolve(urls);
      });
    }).on("error", () => resolve([]));
  });
}

// ── Descargar imagen como base64 ───────────────────────────
function descargarBase64(imageUrl) {
  return new Promise((resolve) => {
    const parsedUrl = url.parse(imageUrl);
    const lib = parsedUrl.protocol === "https:" ? https : http;
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.path,
      headers: {
        "User-Agent": USER_AGENTS[0],
        "Referer": "https://www.google.com/",
      },
      timeout: 15000,
    };
    lib.get(options, (res) => {
      if (res.statusCode !== 200) { resolve(null); return; }
      const contentType = res.headers["content-type"] || "";
      if (!contentType.startsWith("image/")) { resolve(null); return; }
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => {
        const buffer = Buffer.concat(chunks);
        if (buffer.length < 2048) { resolve(null); return; }
        resolve(buffer.toString("base64"));
      });
    }).on("error", () => resolve(null));
  });
}

// ══════════════════════════════════════════════════════════
//  ENDPOINTS
// ══════════════════════════════════════════════════════════

// Login
app.post("/api/login", (req, res) => {
  const { password } = req.body;
  if (password === CONFIG.APP_PASS) {
    req.session.authenticated = true;
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: "Clave incorrecta" });
  }
});

// Logout
app.post("/api/logout", (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// Check session
app.get("/api/me", (req, res) => {
  res.json({ authenticated: !!req.session.authenticated });
});

// Traer productos sin imagen de Odoo
app.get("/api/productos", requireAuth, async (req, res) => {
  try {
    const uid = await odooAuth();
    const ids = await odooExecute(uid, "product.template", "search", [[
      ["active", "=", true],
      ["image_1920", "=", false],
    ]]);

    if (!ids.length) return res.json({ productos: [], total: 0 });

    const productos = await odooExecute(uid, "product.template", "read", [ids], {
      fields: ["id", "name", "default_code", "categ_id"]
    });

    const resultado = productos.map(p => ({
      id: p.id,
      nombre: p.name,
      ref: p.default_code || "",
      categoria: p.categ_id ? p.categ_id[1].replace("All / ", "").replace("Todos / ", "") : "",
    }));

    res.json({ productos: resultado, total: resultado.length });
  } catch (e) {
    console.error("Error Odoo:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Buscar imágenes para un producto
app.post("/api/buscar-imagenes", requireAuth, async (req, res) => {
  const { nombre, ref, categoria } = req.body;

  // Query builder
  const palabrasReales = (nombre || "").match(/[a-zA-ZáéíóúñÁÉÍÓÚÑ]{3,}/g) || [];
  let query;
  if (palabrasReales.length >= 2) {
    query = nombre;
  } else {
    query = [categoria, ref].filter(Boolean).join(" ") || nombre;
  }

  try {
    const urls = await buscarImagenes(query);
    res.json({ urls, query });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Subir imagen aprobada a Odoo
app.post("/api/subir-imagen", requireAuth, async (req, res) => {
  const { producto_id, imagen_url } = req.body;
  try {
    const imagen_b64 = await descargarBase64(imagen_url);
    if (!imagen_b64) return res.status(400).json({ error: "No se pudo descargar la imagen" });

    const uid = await odooAuth();
    await odooExecute(uid, "product.template", "write", [
      [producto_id], { image_1920: imagen_b64 }
    ]);

    res.json({ ok: true });
  } catch (e) {
    console.error("Error subiendo imagen:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Start ──────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));
