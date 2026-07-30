import express from 'express';
import multer from 'multer';
import { 
  analyzeExcelFile, 
  processBigQuerySearch, 
  exportExcel 
} from './bigquery.controller.js';
import { config as firebaseConfig } from '../firebase/firebase.config.js';

const router = express.Router();

// Configuración de multer para cargar archivos a memoria RAM directamente
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: firebaseConfig.maxFileSize
  }
});

// Paso 1: Analizar estructura básica (Nombres de hojas y cantidad de filas)
router.post('/analyze', upload.single('file'), analyzeExcelFile);

// Paso 2: Cargar archivo, procesar hojas seleccionadas y buscar en BigQuery
router.post('/search', upload.single('file'), processBigQuerySearch);

// Paso 3: Exportar JSON recibido a formato Excel formateado (.xlsx)
router.post('/export-excel', express.json({ limit: '50mb' }), exportExcel);

export default router;
