import express from 'express';
import multer from 'multer';
import { analyzeExcelFile, processOrdersFile, exportCsv } from './firebase.controller.js';
import { config } from './firebase.config.js';

const router = express.Router();

// Configuración de multer para cargar archivos a memoria RAM directamente
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: config.maxFileSize // Control de seguridad física de peso de archivo
  }
});

// Paso 1: Analizar estructura básica (Nombres de hojas y cantidad de filas)
router.post('/analyze', upload.single('file'), analyzeExcelFile);

// Paso 2: Cargar archivo, procesar hojas seleccionadas y buscar en Firestore
router.post('/orders', upload.single('file'), processOrdersFile);

// Paso 3: Exportar resultados a formato CSV (Procesa el archivo directamente en el backend)
router.post('/export-csv', upload.single('file'), exportCsv);

export default router;
