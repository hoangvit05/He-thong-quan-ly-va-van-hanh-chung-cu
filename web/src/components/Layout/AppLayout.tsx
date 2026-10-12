import React from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'Arial, sans-serif' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Header />
        <main style={{ padding: '24px', backgroundColor: '#f4f6f8', flex: 1 }}>
          {children}
        </main>
      </div>
    </div>
  );
};
