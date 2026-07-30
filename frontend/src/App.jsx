import { useState, useEffect, useMemo } from 'react';
import { Clock } from 'lucide-react';
import Header from './components/common/Header.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import FirebaseSearchPage from './pages/FirebaseSearch/FirebaseSearchPage.jsx';
import BigQuerySearchPage from './pages/BigQuerySearch/BigQuerySearchPage.jsx';

export default function App() {
  const [activeModule, setActiveModule] = useState('dashboard'); // dashboard, firebase, o bigquery
  const [company, setCompany] = useState('LP'); // LP, SBB, LP_DECOMM, SBB_DECOMM, etc.

  // Dinamizar el color de marca según la compañía seleccionada (mantiene consistencia con estilos existentes)
  useEffect(() => {
    const isLP = company.startsWith('LP');
    const brandColor = isLP ? '#e10098' : '#552166';
    const brandRgb = isLP ? '225, 0, 152' : '85, 33, 102';
    document.documentElement.style.setProperty('--brand-primary', brandColor);
    document.documentElement.style.setProperty('--brand-primary-rgb', brandRgb);
    document.documentElement.setAttribute('data-company', company);
  }, [company]);

  // Generar título y subtítulo dinámico según el módulo seleccionado
  const headerTitle = useMemo(() => {
    if (activeModule === 'firebase') {
      return 'Firebase Search';
    }
    if (activeModule === 'bigquery') {
      return 'BigQuery Search';
    }
    const siteTitle = company.startsWith('LP') ? 'Liverpool' : 'Suburbia';
    return `Reporte Ejecutivo · Pedidos ${siteTitle}${company.includes('DECOMM') ? ' (Decomm)' : ''}${company.includes('RECALC') ? ' (Recalculo)' : ''}`;
  }, [activeModule, company]);

  const headerSubtitle = useMemo(() => {
    if (activeModule === 'firebase') {
      return 'Busca órdenes de forma eficiente mediante un archivo de Excel (.xlsx) y consulta Firestore.';
    }
    if (activeModule === 'bigquery') {
      return 'Busca órdenes en Google BigQuery utilizando un archivo Excel (.xlsx) y genera un reporte Excel formateado.';
    }
    const reportSource = company.includes('RECALC') 
      ? 'FAC_EDD_RECALCULATE_TRN' 
      : company.includes('DECOMM') 
        ? 'FAC_EDD_ORDERS_TRN' 
        : 'tables_raw_changelog';
    return `Distribución diaria de pedidos por plan: A, B y Error · Compañía ${company.replace('_DECOMM', '').replace('_RECALC', '')} · ${reportSource}`;
  }, [activeModule, company]);

  // Contenido de metadata en la derecha de la cabecera (reutiliza el reloj)
  const headerMeta = useMemo(() => {
    if (activeModule === 'firebase') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '500', color: 'var(--text-3)' }}>
          <span className="dot" aria-hidden="true" style={{ background: 'var(--success)' }} />
          <span>Firestore Módulo Activo</span>
        </div>
      );
    }
    if (activeModule === 'bigquery') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '500', color: 'var(--text-3)' }}>
          <span className="dot" aria-hidden="true" style={{ background: 'var(--brand-primary)' }} />
          <span>BigQuery Módulo Activo</span>
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '500', color: 'var(--text-2)' }}>
        <span className="dot" aria-hidden="true" />
        <Clock size={12} />
        <span>América/México</span>
      </div>
    );
  }, [activeModule]);

  return (
    <div className="container">
      
      {/* ─── Cabecera Reutilizable ─── */}
      <Header
        title={headerTitle}
        subtitle={headerSubtitle}
        metaContent={headerMeta}
      />

      {/* ─── Barra de Navegación de Módulos (Estilo Stripe / Tab Bar) ─── */}
      <div className="module-navigation" style={{
        display: 'flex',
        gap: '24px',
        borderBottom: '2px solid var(--border)',
        marginBottom: '28px',
        paddingBottom: '2px'
      }}>
        <button
          onClick={() => setActiveModule('dashboard')}
          className={`nav-module-btn ${activeModule === 'dashboard' ? 'active' : ''}`}
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: activeModule === 'dashboard' ? '3px solid var(--brand-primary)' : '3px solid transparent',
            color: activeModule === 'dashboard' ? 'var(--brand-primary)' : 'var(--text-3)',
            padding: '10px 4px',
            fontSize: '15px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all var(--t-fast) ease',
            marginBottom: '-3.5px'
          }}
        >
          Dashboard BigQuery
        </button>
        <button
          onClick={() => setActiveModule('firebase')}
          className={`nav-module-btn ${activeModule === 'firebase' ? 'active' : ''}`}
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: activeModule === 'firebase' ? '3px solid var(--brand-primary)' : '3px solid transparent',
            color: activeModule === 'firebase' ? 'var(--brand-primary)' : 'var(--text-3)',
            padding: '10px 4px',
            fontSize: '15px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all var(--t-fast) ease',
            marginBottom: '-3.5px'
          }}
        >
          Firebase Search
        </button>
        <button
          onClick={() => setActiveModule('bigquery')}
          className={`nav-module-btn ${activeModule === 'bigquery' ? 'active' : ''}`}
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: activeModule === 'bigquery' ? '3px solid var(--brand-primary)' : '3px solid transparent',
            color: activeModule === 'bigquery' ? 'var(--brand-primary)' : 'var(--text-3)',
            padding: '10px 4px',
            fontSize: '15px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all var(--t-fast) ease',
            marginBottom: '-3.5px'
          }}
        >
          BigQuery Search
        </button>
      </div>

      {/* ─── Renderizado de Páginas ─── */}
      {activeModule === 'dashboard' ? (
        <DashboardPage
          company={company}
          setCompany={setCompany}
        />
      ) : activeModule === 'firebase' ? (
        <FirebaseSearchPage />
      ) : (
        <BigQuerySearchPage />
      )}

    </div>
  );
}
