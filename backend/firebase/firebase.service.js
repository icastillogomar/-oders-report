import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore as getFirestoreSDK } from 'firebase-admin/firestore';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Forzar la carga de .env por si la importación ESM se ejecuta antes del dotenv.config() de server.js
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db = null;

/**
 * Inicializa y retorna la instancia de Firestore de forma segura usando la API modular de Firebase Admin.
 * Implementa una estrategia de búsqueda de cuenta de servicio (Service Account) ultra-robusta a prueba de directorios.
 * @returns {import('firebase-admin/firestore').Firestore} Instancia de Firestore
 */
export function getFirestore() {
  if (db) return db;

  const keyEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const projectId = process.env.GCP_PROJECT_ID;

  // getApps() de la API modular siempre es un array válido
  if (getApps().length === 0) {
    const options = {};
    let resolvedPath = null;

    // Estrategia de resolución de credenciales a prueba de fallos (Bulletproof Resolving)
    
    // 1. Intentar resolver la variable de entorno de Google Application Credentials
    if (keyEnv) {
      const envPath = path.resolve(process.cwd(), keyEnv);
      if (fs.existsSync(envPath)) {
        resolvedPath = envPath;
      }
    }

    // 2. Fallback 1: Buscar 'service-account.json' en el directorio de trabajo actual (process.cwd())
    if (!resolvedPath) {
      const cwdPath = path.resolve(process.cwd(), 'service-account.json');
      if (fs.existsSync(cwdPath)) {
        resolvedPath = cwdPath;
      }
    }

    // 3. Fallback 2: Buscar 'backend/service-account.json' por si el proceso arrancó desde la raíz del proyecto
    if (!resolvedPath) {
      const rootPath = path.resolve(process.cwd(), 'backend', 'service-account.json');
      if (fs.existsSync(rootPath)) {
        resolvedPath = rootPath;
      }
    }

    // 4. Fallback 3: Buscar relativo al archivo de este script (dos niveles arriba de backend/firebase/firebase.service.js -> backend/)
    if (!resolvedPath) {
      const modulePath = path.resolve(__dirname, '..', 'service-account.json');
      if (fs.existsSync(modulePath)) {
        resolvedPath = modulePath;
      }
    }

    // Aplicar credenciales encontradas o alertar
    if (resolvedPath) {
      options.credential = cert(resolvedPath);
      console.log(`✓ [Firebase] Inicializado de forma local usando Service Account en: ${resolvedPath}`);
    } else {
      console.warn('[Firebase Warning] No se encontró "service-account.json" en ninguna ruta conocida. Se intentará usar las credenciales por defecto de GCP (Application Default Credentials).');
    }

    if (projectId) {
      options.projectId = projectId;
    }

    try {
      initializeApp(options);
      console.log('✓ [Firebase] Admin SDK modular inicializado exitosamente');
    } catch (error) {
      console.error('[Firebase Error] Error al inicializar Firebase Admin modular:', error);
      throw error;
    }
  }

  db = getFirestoreSDK();
  
  // Ignorar propiedades indefinidas para evitar errores al consultar
  db.settings({ ignoreUndefinedProperties: true });

  return db;
}
