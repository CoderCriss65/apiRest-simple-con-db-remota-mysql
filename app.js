const express = require("express");
const cors = require("cors");
const path = require("path");
const config = require("./config.js");
const mysql = require("mysql2");

const app = express();
const PORT = config.port;

// ==================== CONFIGURACIÓN DE LOGGING ====================
const logger = {
  log: (message, data) => {
    const timestamp = new Date().toISOString();
    if (data) {
      console.log(`[${timestamp}] ${message}`, data);
    } else {
      console.log(`[${timestamp}] ${message}`);
    }
  },
  error: (message, error) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ERROR: ${message}`, error);
  },
  request: (req) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] REQUEST: ${req.method} ${req.originalUrl}`);
    
    // Verificación segura de req.body
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
      console.log(`[${timestamp}] REQUEST BODY:`, req.body);
    }
    
    // Verificación segura de req.query
    if (req.query && typeof req.query === 'object' && Object.keys(req.query).length > 0) {
      console.log(`[${timestamp}] QUERY PARAMS:`, req.query);
    }
  },
  response: (res, body) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] RESPONSE: ${res.statusCode} ${res.statusMessage}`);
    if (body && typeof body === 'object' && Object.keys(body).length > 0) {
      console.log(`[${timestamp}] RESPONSE BODY:`, body);
    }
  },
  query: (sql, params) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] DB QUERY: ${sql}`);
    if (params && Array.isArray(params) && params.length > 0) {
      console.log(`[${timestamp}] DB PARAMS:`, params);
    }
  },
  queryResult: (result) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] DB RESULT:`, result);
  }
};

// Middleware para parsear JSON
app.use(express.json());

// Middleware para loggear solicitudes (después de express.json)
app.use((req, res, next) => {
  try {
    logger.request(req);
    next();
  } catch (error) {
    logger.error("Error en logger de solicitud:", error);
    next();
  }
});

// Middleware para CORS
app.use(cors());

// Middleware para archivos estáticos
app.use(express.static(path.join(__dirname, "src")));

// Middleware para loggear respuestas
app.use((req, res, next) => {
  const originalSend = res.send;
  res.send = function (body) {
    try {
      logger.response(res, body);
    } catch (error) {
      logger.error("Error en logger de respuesta:", error);
    }
    originalSend.call(this, body);
  };
  next();
});

// ==================== CONEXIÓN A LA BASE DE DATOS ====================
const db = mysql.createPool({
  host: config.dbConfig.host,
  user: config.dbConfig.user,
  password: config.dbConfig.password,
  database: config.dbConfig.database,
  port: 3306,
  ssl: {
    rejectUnauthorized: false
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Verificar conexión
db.getConnection((err, connection) => {
  if (err) {
    logger.error("Error de conexión a Clever Cloud MySQL:", err);
    logger.log("Configuración usada:", config.dbConfig);
    process.exit(1);
  } else {
    logger.log("✅ Conectado a Clever Cloud MySQL con SSL");
    connection.release();
    
    // Verificar tablas
    db.query("SHOW TABLES", (err, results) => {
      if (err) {
        logger.error("Error al verificar tablas:", err);
      } else {
        logger.log(`Tablas disponibles: ${results.length}`);
        logger.queryResult(results);
      }
    });
  }
});

// ==================== FUNCIÓN PARA EJECUTAR CONSULTAS CON LOGGING ====================
function executeQuery(sql, params, callback) {
  try {
    logger.query(sql, params);
    db.query(sql, params, (error, results) => {
      if (error) {
        logger.error("Error en consulta SQL:", error);
      } else {
        logger.queryResult(results);
      }
      callback(error, results);
    });
  } catch (error) {
    logger.error("Error en executeQuery:", error);
    callback(error, null);
  }
}

// ==================== RUTA PRINCIPAL ====================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "index.html"));
});

// ==================== MÓDULO EMPLEADOS ====================
const empleadosRouter = express.Router();

empleadosRouter.get("/", (req, res) => {
  executeQuery("SELECT * FROM empleados", [], (error, results) => {
    if (error) {
      res.status(500).json({ error: error.message });
    } else {
      res.json(results);
    }
  });
});

empleadosRouter.get("/:id", (req, res) => {
  const id = req.params.id;
  executeQuery("SELECT * FROM empleados WHERE id = ?", [id], (error, results) => {
    if (error) {
      res.status(500).json({ error: error.message });
    } else if (results.length === 0) {
      logger.log("Empleado no encontrado");
      res.status(404).json({ mensaje: "Empleado no encontrado" });
    } else {
      res.json(results[0]);
    }
  });
});

empleadosRouter.post("/", (req, res) => {
  const { nombre, puesto, salario } = req.body;
  
  if (!nombre || !puesto || !salario) {
    logger.log("Validación fallida: Campos obligatorios faltantes para empleado");
    return res.status(400).json({ mensaje: "Todos los campos son obligatorios" });
  }

  executeQuery(
    "INSERT INTO empleados (nombre, puesto, salario) VALUES (?, ?, ?)",
    [nombre, puesto, salario],
    (error, result) => {
      if (error) {
        res.status(500).json({ error: error.message });
      } else {
        logger.log(`Empleado creado con ID: ${result.insertId}`);
        res.status(201).json({ mensaje: "Empleado agregado", id: result.insertId });
      }
    }
  );
});

empleadosRouter.put("/:id", (req, res) => {
  const id = req.params.id;
  const { nombre, puesto, salario } = req.body;

  if (!nombre || !puesto || !salario) {
    logger.log("Validación fallida: Campos obligatorios faltantes para actualizar empleado");
    return res.status(400).json({ mensaje: "Todos los campos son obligatorios" });
  }

  executeQuery(
    "UPDATE empleados SET nombre = ?, puesto = ?, salario = ? WHERE id = ?",
    [nombre, puesto, salario, id],
    (error, result) => {
      if (error) {
        res.status(500).json({ error: error.message });
      } else if (result.affectedRows === 0) {
        logger.log(`Empleado no encontrado: ID ${id}`);
        res.status(404).json({ mensaje: "Empleado no encontrado" });
      } else {
        logger.log(`Empleado actualizado: ID ${id}`);
        res.json({ mensaje: "Empleado actualizado correctamente" });
      }
    }
  );
});

empleadosRouter.delete("/:id", (req, res) => {
  const id = req.params.id;
  
  executeQuery("DELETE FROM empleados WHERE id = ?", [id], (error, result) => {
    if (error) {
      res.status(500).json({ error: error.message });
    } else if (result.affectedRows === 0) {
      logger.log(`Empleado no encontrado: ID ${id}`);
      res.status(404).json({ mensaje: "Empleado no encontrado" });
    } else {
      logger.log(`Empleado eliminado: ID ${id}`);
      res.json({ mensaje: "Empleado eliminado correctamente" });
    }
  });
});

// ==================== MÓDULO CLIENTES ====================
const clientesRouter = express.Router();

clientesRouter.get("/", (req, res) => {
  executeQuery("SELECT * FROM clientes", [], (error, results) => {
    if (error) {
      res.status(500).json({ error: error.message });
    } else {
      res.json(results);
    }
  });
});

clientesRouter.get("/:id", (req, res) => {
  const id = req.params.id;
  executeQuery("SELECT * FROM clientes WHERE id_cliente = ?", [id], (error, results) => {
    if (error) {
      res.status(500).json({ error: error.message });
    } else if (results.length === 0) {
      logger.log("Cliente no encontrado");
      res.status(404).json({ mensaje: "Cliente no encontrado" });
    } else {
      res.json(results[0]);
    }
  });
});

clientesRouter.post("/", (req, res) => {
  const { numero_identificacion, nombre_cliente, telefono_cliente, email_cliente } = req.body;
  
  if (!numero_identificacion || !nombre_cliente || !telefono_cliente) {
    logger.log("Validación fallida: Campos obligatorios faltantes para cliente");
    return res.status(400).json({ 
      mensaje: "Número de identificación, nombre y teléfono son obligatorios" 
    });
  }

  executeQuery(
    "INSERT INTO clientes (numero_identificacion, nombre_cliente, telefono_cliente, email_cliente) VALUES (?, ?, ?, ?)",
    [numero_identificacion, nombre_cliente, telefono_cliente, email_cliente || null],
    (error, result) => {
      if (error) {
        res.status(500).json({ error: error.message });
      } else {
        logger.log(`Cliente creado con ID: ${result.insertId}`);
        res.status(201).json({ mensaje: "Cliente agregado", id: result.insertId });
      }
    }
  );
});

clientesRouter.put("/:id", (req, res) => {
  const id = req.params.id;
  const { numero_identificacion, nombre_cliente, telefono_cliente, email_cliente } = req.body;

  if (!numero_identificacion || !nombre_cliente || !telefono_cliente) {
    logger.log("Validación fallida: Campos obligatorios faltantes para actualizar cliente");
    return res.status(400).json({ 
      mensaje: "Número de identificación, nombre y teléfono son obligatorios" 
    });
  }

  executeQuery(
    "UPDATE clientes SET numero_identificacion = ?, nombre_cliente = ?, telefono_cliente = ?, email_cliente = ? WHERE id_cliente = ?",
    [numero_identificacion, nombre_cliente, telefono_cliente, email_cliente || null, id],
    (error, result) => {
      if (error) {
        res.status(500).json({ error: error.message });
      } else if (result.affectedRows === 0) {
        logger.log(`Cliente no encontrado: ID ${id}`);
        res.status(404).json({ mensaje: "Cliente no encontrado" });
      } else {
        logger.log(`Cliente actualizado: ID ${id}`);
        res.json({ mensaje: "Cliente actualizado correctamente" });
      }
    }
  );
});

clientesRouter.delete("/:id", (req, res) => {
  const id = req.params.id;
  
  executeQuery("DELETE FROM clientes WHERE id_cliente = ?", [id], (error, result) => {
    if (error) {
      res.status(500).json({ error: error.message });
    } else if (result.affectedRows === 0) {
      logger.log(`Cliente no encontrado: ID ${id}`);
      res.status(404).json({ mensaje: "Cliente no encontrado" });
    } else {
      logger.log(`Cliente eliminado: ID ${id}`);
      res.json({ mensaje: "Cliente eliminado correctamente" });
    }
  });
});

// ==================== MÓDULO PROVEEDORES ====================
const proveedoresRouter = express.Router();

proveedoresRouter.get("/", (req, res) => {
  executeQuery("SELECT * FROM proveedores", [], (error, results) => {
    if (error) {
      res.status(500).json({ error: error.message });
    } else {
      res.json(results);
    }
  });
});

proveedoresRouter.get("/:id", (req, res) => {
  const id = req.params.id;
  executeQuery("SELECT * FROM proveedores WHERE id_proveedor = ?", [id], (error, results) => {
    if (error) {
      res.status(500).json({ error: error.message });
    } else if (results.length === 0) {
      logger.log("Proveedor no encontrado");
      res.status(404).json({ mensaje: "Proveedor no encontrado" });
    } else {
      res.json(results[0]);
    }
  });
});

proveedoresRouter.post("/", (req, res) => {
  const { numero_identificacion, nombre_proveedor, contacto_principal, telefono_proveedor } = req.body;
  
  if (!numero_identificacion || !nombre_proveedor || !contacto_principal || !telefono_proveedor) {
    logger.log("Validación fallida: Campos obligatorios faltantes para proveedor");
    return res.status(400).json({ mensaje: "Todos los campos son obligatorios" });
  }

  executeQuery(
    "INSERT INTO proveedores (numero_identificacion, nombre_proveedor, contacto_principal, telefono_proveedor) VALUES (?, ?, ?, ?)",
    [numero_identificacion, nombre_proveedor, contacto_principal, telefono_proveedor],
    (error, result) => {
      if (error) {
        res.status(500).json({ error: error.message });
      } else {
        logger.log(`Proveedor creado con ID: ${result.insertId}`);
        res.status(201).json({ mensaje: "Proveedor agregado", id: result.insertId });
      }
    }
  );
});

proveedoresRouter.put("/:id", (req, res) => {
  const id = req.params.id;
  const { numero_identificacion, nombre_proveedor, contacto_principal, telefono_proveedor } = req.body;

  if (!numero_identificacion || !nombre_proveedor || !contacto_principal || !telefono_proveedor) {
    logger.log("Validación fallida: Campos obligatorios faltantes para actualizar proveedor");
    return res.status(400).json({ mensaje: "Todos los campos son obligatorios" });
  }

  executeQuery(
    "UPDATE proveedores SET numero_identificacion = ?, nombre_proveedor = ?, contacto_principal = ?, telefono_proveedor = ? WHERE id_proveedor = ?",
    [numero_identificacion, nombre_proveedor, contacto_principal, telefono_proveedor, id],
    (error, result) => {
      if (error) {
        res.status(500).json({ error: error.message });
      } else if (result.affectedRows === 0) {
        logger.log(`Proveedor no encontrado: ID ${id}`);
        res.status(404).json({ mensaje: "Proveedor no encontrado" });
      } else {
        logger.log(`Proveedor actualizado: ID ${id}`);
        res.json({ mensaje: "Proveedor actualizado correctamente" });
      }
    }
  );
});

proveedoresRouter.delete("/:id", (req, res) => {
  const id = req.params.id;
  
  executeQuery("DELETE FROM proveedores WHERE id_proveedor = ?", [id], (error, result) => {
    if (error) {
      res.status(500).json({ error: error.message });
    } else if (result.affectedRows === 0) {
      logger.log(`Proveedor no encontrado: ID ${id}`);
      res.status(404).json({ mensaje: "Proveedor no encontrado" });
    } else {
      logger.log(`Proveedor eliminado: ID ${id}`);
      res.json({ mensaje: "Proveedor eliminado correctamente" });
    }
  });
});

// ==================== MONTAR RUTAS ====================
app.use("/empleados", empleadosRouter);
app.use("/clientes", clientesRouter);
app.use("/proveedores", proveedoresRouter);

// ==================== MANEJO DE ERRORES ====================
app.use((err, req, res, next) => {
  logger.error("Error no manejado:", err);
  res.status(500).json({ error: "Error interno del servidor" });
});

// ==================== INICIAR SERVIDOR ====================
app.listen(PORT, "0.0.0.0", () => {
  logger.log(`Servidor corriendo en http://0.0.0.0:${PORT}`);
});